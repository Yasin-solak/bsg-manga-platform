import { signalDiagnostic } from './diagnosticSignal'
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>

export interface StructuredLogEntry {
  event: string
  message?: string
  context?: LogContext
  error?: unknown
}

type LogInput = string | StructuredLogEntry

type LogPayload = {
  scope: string
  event: string
  message: string | null
  context: LogContext | null
  error?: unknown
  args: unknown[]
}

const DEV_ONLY_LEVELS = new Set<LogLevel>(['debug', 'info'])

function isDevelopment() {
  return typeof import.meta !== 'undefined' && import.meta.env?.DEV === true
}

function isStructuredLogEntry(input: LogInput): input is StructuredLogEntry {
  return typeof input === 'object' && input !== null && 'event' in input && typeof input.event === 'string'
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return error
}

function normalizeArgs(args: unknown[]) {
  return args.map((arg) => normalizeError(arg))
}

function normalizeContext(context?: LogContext | null) {
  if (!context) return null
  const entries = Object.entries(context).filter(([, value]) => value !== undefined)
  if (entries.length === 0) return null
  return Object.fromEntries(entries)
}

function toPayload(scope: string, input: LogInput, args: unknown[]): LogPayload {
  if (!isStructuredLogEntry(input)) {
    return {
      scope,
      event: 'message',
      message: input,
      context: null,
      args,
    }
  }

  return {
    scope,
    event: input.event,
    message: input.message || null,
    context: normalizeContext(input.context),
    error: input.error,
    args,
  }
}

function emit(level: LogLevel, payload: LogPayload) {
  if (level === 'error') signalDiagnostic(payload.scope === 'AppErrorBoundary' ? 'render_error' : 'service_error')
  if (DEV_ONLY_LEVELS.has(level) && !isDevelopment()) return

  const method = level === 'debug' ? 'debug' : level
  const consoleMethod = console[method] as (...values: unknown[]) => void
  const headline = payload.message ? `${payload.event} - ${payload.message}` : payload.event
  const extras: unknown[] = []

  if (payload.context) {
    extras.push({ context: payload.context })
  }

  if (payload.error !== undefined) {
    extras.push({ error: normalizeError(payload.error) })
  }

  if (payload.args.length > 0) {
    extras.push(...normalizeArgs(payload.args))
  }

  consoleMethod(`[${payload.scope}] ${headline}`, ...extras)
}

export interface ScopedLogger {
  debug: (input: LogInput, ...args: unknown[]) => void
  info: (input: LogInput, ...args: unknown[]) => void
  warn: (input: LogInput, ...args: unknown[]) => void
  error: (input: LogInput, ...args: unknown[]) => void
}

export function createScopedLogger(scope: string): ScopedLogger {
  return {
    debug(input, ...args) {
      emit('debug', toPayload(scope, input, args))
    },
    info(input, ...args) {
      emit('info', toPayload(scope, input, args))
    },
    warn(input, ...args) {
      emit('warn', toPayload(scope, input, args))
    },
    error(input, ...args) {
      emit('error', toPayload(scope, input, args))
    },
  }
}

export const devLogger = createScopedLogger('dev')
