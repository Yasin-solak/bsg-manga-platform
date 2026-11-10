// A constant signal stream cannot extend the wait; a closed subscription does not run.
export function createCommunityRefreshScheduler(refresh: () => void, delay = 120, clock = {
  set: (callback: () => void, ms: number) => setTimeout(callback, ms),
  clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  return {
    invalidate() {
      if (disposed || timer !== undefined) return
      timer = clock.set(() => { timer = undefined; if (!disposed) refresh() }, delay)
    },
    dispose() { disposed = true; if (timer !== undefined) clock.clear(timer); timer = undefined },
  }
}
