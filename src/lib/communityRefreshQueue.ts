export type CommunityRefreshKind = 'full' | 'activity'

// Single flight: HTTP requests do not pile up per signal. A full check always takes priority.
export function createCommunityRefreshQueue(run: (kind: CommunityRefreshKind, current: () => boolean) => Promise<void>) {
  let running = false, disposed = false, revision = 0
  let pending: CommunityRefreshKind | null = null
  let waiters: { resolve: () => void; reject: (error: unknown) => void }[] = []
  async function drain() {
    if (running || disposed) return
    running = true
    try {
      while (pending && !disposed) {
        const kind = pending, version = revision, batch = waiters
        pending = null; waiters = []
        try { await run(kind, () => !disposed && version === revision); batch.forEach(waiter => waiter.resolve()) }
        catch (error) { batch.forEach(waiter => waiter.reject(error)) }
      }
    } finally { running = false }
  }
  return {
    request(kind: CommunityRefreshKind) {
      if (disposed) return Promise.resolve()
      // An old response started during a permission change cannot be applied.
      if (kind === 'full') revision++
      pending = pending === 'full' || kind === 'full' ? 'full' : 'activity'
      const done = new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }))
      void drain()
      return done
    },
    dispose() { disposed = true; revision++; pending = null; waiters.forEach(waiter => waiter.resolve()); waiters = [] },
  }
}
