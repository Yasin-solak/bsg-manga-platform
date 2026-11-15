export interface VisiblePollingOptions {
  /** Fraction of the interval used as +/- random spread per tick. Default 0.18. */
  jitter?: number
  /** Run the task once right away. Default false (callers usually load on mount themselves). */
  immediate?: boolean
  /**
   * Run the task once when the tab becomes visible again. Default true. Pass false only when the
   * caller already refreshes on visibilitychange itself, to avoid a duplicate request.
   */
  catchUp?: boolean
  /** Injectable for tests. */
  random?: () => number
}

const DEFAULT_JITTER = 0.18

export function jitterIntervalMs(intervalMs: number, jitter = DEFAULT_JITTER, random: () => number = Math.random) {
  const spread = Math.min(Math.max(jitter, 0), 0.5)
  return Math.max(250, Math.round(intervalMs * (1 + (random() * 2 - 1) * spread)))
}

function isTabHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/**
 * Polls `task` while the tab is visible and returns a stop function.
 * - Each wait is the interval +/- jitter so open tabs do not fire in lockstep.
 * - While the tab is hidden nothing is scheduled; on becoming visible the task runs once
 *   (catch-up) and the cycle restarts.
 * - A slow task never overlaps itself: the next wait starts after it settles.
 * Task errors are swallowed here; handle them inside the task.
 */
export function startVisiblePolling(
  task: () => unknown,
  intervalMs: number,
  options: VisiblePollingOptions = {},
): () => void {
  const random = options.random ?? Math.random
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const schedule = () => {
    clear()
    if (stopped || isTabHidden()) return
    timer = setTimeout(() => { timer = undefined; void run() }, jitterIntervalMs(intervalMs, options.jitter, random))
  }

  const run = async () => {
    if (stopped || running) return
    if (isTabHidden()) return
    running = true
    try {
      await task()
    } catch {
      // The task owns its error handling; polling must keep going.
    } finally {
      running = false
      schedule()
    }
  }

  const onVisibilityChange = () => {
    if (stopped) return
    if (isTabHidden()) {
      clear()
      return
    }
    // One catch-up run for the time spent hidden, then a fresh jittered cycle.
    clear()
    if (options.catchUp === false) schedule()
    else void run()
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  if (options.immediate) void run()
  else schedule()

  return () => {
    stopped = true
    clear()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}
