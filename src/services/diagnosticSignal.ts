// Only fixed error categories are sent instead of raw logs.
type Signal = 'service_error' | 'render_error'
let listener: ((code: Signal) => void) | null = null
export function setDiagnosticListener(next: typeof listener) { listener = next }
export function signalDiagnostic(code: Signal) { listener?.(code) }
