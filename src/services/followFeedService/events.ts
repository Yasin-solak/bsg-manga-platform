import type { FollowActivityActorType } from './types'

const FOLLOW_GRAPH_MUTATED_EVENT = 'follow-feed:follow-graph-mutated'

export interface FollowGraphMutationPayload {
  viewerId: string
  actorType: FollowActivityActorType
  actorId: string
  action: 'followed' | 'unfollowed'
  occurredAt: string
}

export function emitFollowGraphMutation(payload: FollowGraphMutationPayload) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<FollowGraphMutationPayload>(FOLLOW_GRAPH_MUTATED_EVENT, {
      detail: payload,
    }),
  )
}

export function subscribeFollowGraphMutations(
  listener: (payload: FollowGraphMutationPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<FollowGraphMutationPayload>).detail
    if (!detail) return
    listener(detail)
  }

  window.addEventListener(FOLLOW_GRAPH_MUTATED_EVENT, handler)
  return () => {
    window.removeEventListener(FOLLOW_GRAPH_MUTATED_EVENT, handler)
  }
}
