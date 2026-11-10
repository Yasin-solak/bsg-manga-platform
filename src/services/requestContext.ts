export interface RequestContext<TContext extends Record<string, unknown> = Record<string, unknown>> {
  scope: string
  event: string
  requestId: string
  context: TContext
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createRequestContext<TContext extends Record<string, unknown> = Record<string, unknown>>(
  scope: string,
  event: string,
  context?: TContext,
): RequestContext<TContext> {
  return {
    scope,
    event,
    requestId: createRequestId(),
    context: (context || {}) as TContext,
  }
}

export function toRequestContextLogContext<TContext extends Record<string, unknown> = Record<string, unknown>>(
  requestContext: RequestContext<TContext>,
  extraContext?: Record<string, unknown>,
) {
  return {
    requestId: requestContext.requestId,
    ...requestContext.context,
    ...(extraContext || {}),
  }
}
