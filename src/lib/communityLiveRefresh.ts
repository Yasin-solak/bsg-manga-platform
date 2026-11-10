import type { CommunityRefreshKind } from './communityRefreshQueue'

type Clock = { now: () => number; set: (run: () => void, ms: number) => number; clear: (id: number) => void }

// Subscription first, then snapshot: keeps messages in between without doubling the first load.
export function createCommunityLiveRefresh(options: {
  refresh: (kind: CommunityRefreshKind) => void; visible: () => boolean;
  pollMs?: number; repairMs?: number; resumeMs?: number; clock?: Clock;
}) {
  const clock: Clock = options.clock || { now: () => performance.now(), set: (run, ms) => window.setTimeout(run, ms), clear: id => window.clearTimeout(id) }
  const pollMs = options.pollMs ?? 30000 + Math.floor(Math.random() * 5000)
  const resumeMs = options.resumeMs ?? 100 + Math.floor(Math.random() * 400)
  let disposed = false, connected = false, started = false, lastFull = -Infinity
  let startup: number | undefined, resumed: number | undefined
  function run(kind: CommunityRefreshKind) {
    if (disposed || !options.visible()) return
    if (startup !== undefined) { clock.clear(startup); startup = undefined }
    if (kind === 'full' && resumed !== undefined) { clock.clear(resumed); resumed = undefined }
    started = true
    if (kind === 'full') lastFull = clock.now()
    options.refresh(kind)
  }
  function wake() {
    if (disposed || !options.visible() || resumed !== undefined) return
    resumed = clock.set(() => { resumed = undefined; run('full') }, resumeMs)
  }
  // If the socket cannot connect, the HTTP read does not wait; a late subscription also repairs the gap.
  startup = clock.set(() => { startup = undefined; run('full') }, 1000)
  let poll = clock.set(tick, pollMs)
  function tick() {
    if (disposed) return
    run(!started || clock.now() - lastFull >= (options.repairMs ?? 120000) ? 'full' : 'activity')
    poll = clock.set(tick, pollMs)
  }
  return {
    invalidate(activityOnly = false) { run(activityOnly && started ? 'activity' : 'full') },
    connection(value: boolean) {
      if (disposed || connected === value) return
      connected = value
      if (value) { if (!started) run('full'); else wake() }
    },
    wake,
    dispose() {
      disposed = true; clock.clear(poll)
      if (startup !== undefined) clock.clear(startup)
      if (resumed !== undefined) clock.clear(resumed)
    },
  }
}
