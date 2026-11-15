/*
 * AbortSignal.any needs Safari 17.4+ and AbortSignal.timeout needs Safari 16+. Calling a missing
 * static throws a TypeError, so these helpers use the native API when present and fall back otherwise.
 */

/** Signal that aborts as soon as any input aborts, carrying that input's reason. */
export function anyAbortSignal(signals: ReadonlyArray<AbortSignal>): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals as AbortSignal[])

  const controller = new AbortController()
  const alreadyAborted = signals.find((signal) => signal.aborted)
  if (alreadyAborted) {
    controller.abort(alreadyAborted.reason)
    return controller.signal
  }

  const listeners: Array<{ signal: AbortSignal, listener: () => void }> = []
  const cleanup = () => {
    for (const { signal, listener } of listeners) signal.removeEventListener('abort', listener)
    listeners.length = 0
  }
  for (const signal of signals) {
    const listener = () => {
      cleanup()
      controller.abort(signal.reason)
    }
    listeners.push({ signal, listener })
    signal.addEventListener('abort', listener, { once: true })
  }
  return controller.signal
}

/** Signal that aborts with a TimeoutError DOMException after `ms` milliseconds. */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)

  const controller = new AbortController()
  setTimeout(() => {
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'))
  }, ms)
  return controller.signal
}

/** Namespace form used by callers: `abortSignals.timeout(ms)` / `abortSignals.any([...])`. */
export const abortSignals = { any: anyAbortSignal, timeout: timeoutSignal }
