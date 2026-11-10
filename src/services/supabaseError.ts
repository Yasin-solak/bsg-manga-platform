export function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { name?: unknown; code?: unknown; message?: unknown; details?: unknown }
  const name = typeof typed.name === 'string' ? typed.name.toLowerCase() : ''
  const code = typed.code == null ? '' : String(typed.code).toLowerCase()
  const messagePart = typeof typed.message === 'string' ? typed.message : ''
  const detailsPart = typeof typed.details === 'string' ? typed.details : ''
  const message = `${messagePart} ${detailsPart}`.toLowerCase()

  return (
    name === 'aborterror'
    || code === 'abort_err'
    || message.includes('signal is aborted')
    || message.includes('aborted')
  )
}