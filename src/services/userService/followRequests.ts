import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { parseProfileTheme, type ProfileTheme } from '@/lib/profileTheme'
import { supabase } from '../supabase'

/*
 * Private account + follow request: someone wanting to follow a private account sends a request, the owner approves
 * or deletes it. For approve / reject / cancel and the lock screen, the profile relation is calculated on the server (RPC).
 */

export type FollowStatus = 'following' | 'requested'

export interface FollowRequestItem {
  requesterId: string
  username: string
  displayName: string
  avatarUrl: string | null
  frameType: string | null
  createdAt: string
}

export interface ProfileRelationship {
  isPrivate: boolean
  isOwner: boolean
  viewerIsFollower: boolean
  requestPending: boolean
  incomingRequests: number
  followersCount: number
  followingCount: number
  theme: ProfileTheme | null
}

const requestSchema = z.object({
  requesterId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional().transform((value) => value ?? null),
  frameType: z.string().nullable().optional().transform((value) => value ?? null),
  createdAt: z.string(),
})

const relationshipSchema = z.object({
  isPrivate: z.boolean(),
  isOwner: z.boolean(),
  viewerIsFollower: z.boolean(),
  requestPending: z.boolean(),
  incomingRequests: z.number(),
  followersCount: z.number(),
  followingCount: z.number(),
  theme: z.unknown().optional(),
})

async function rpc<T>(fn: string, args: Record<string, unknown>, label: string): Promise<T> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(fn, args), signal),
    { label },
  )
  if (error) throw error
  return data as T
}

/** follow_user response: "following" on a public account, "requested" on a private one. */
export function readFollowStatus(payload: unknown): FollowStatus {
  const status = payload && typeof payload === 'object' ? (payload as { status?: unknown }).status : null
  return status === 'requested' ? 'requested' : 'following'
}

export async function cancelFollowRequest(targetUserId: string) {
  await rpc<null>('cancel_follow_request', { p_target_user_id: targetUserId }, 'Takip istegini geri alma')
}

export async function respondFollowRequest(requesterId: string, accept: boolean) {
  const data = await rpc<{ accepted?: boolean, pending?: number } | null>('respond_follow_request', { p_requester_id: requesterId, p_accept: accept }, 'Takip istegini yanitlama')
  return { accepted: data?.accepted === true, pending: Number(data?.pending ?? 0) }
}

export async function listMyFollowRequests(limit = 50): Promise<FollowRequestItem[]> {
  const data = await rpc<unknown>('list_my_follow_requests', { p_limit: limit }, 'Takip isteklerini yukleme')
  const parsed = z.array(requestSchema).safeParse(data)
  return parsed.success ? parsed.data : []
}

export async function getProfileRelationship(targetUserId: string): Promise<ProfileRelationship | null> {
  const data = await rpc<unknown>('get_profile_relationship', { p_target_user_id: targetUserId }, 'Profil iliskisini yukleme')
  if (!data) return null
  const parsed = relationshipSchema.safeParse(data)
  if (!parsed.success) return null
  return { ...parsed.data, theme: parseProfileTheme(parsed.data.theme) }
}
