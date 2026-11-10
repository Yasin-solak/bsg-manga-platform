import type {
  FansubInvite,
  FansubJoinRequest,
  FansubMemberForManagement,
  FansubMemberRole,
  FansubMembership,
} from './types'
import type {
  DbFansubInviteRow,
  DbFansubJoinRequestRow,
  DbFansubMemberForManagementRow,
  DbFansubMembershipRow,
} from './shared.types'
import { getSingleRelation } from './shared.utils'

const FANSUB_MEMBER_ROLE_RANK: Record<FansubMemberRole, number> = {
  admin: 0,
  moderator: 1,
  member: 2,
}

export function mapDbFansubMembership(row: DbFansubMembershipRow): FansubMembership {
  const fansubRow = getSingleRelation(row.fansub)
  return {
    fansubId: row.fansub_id,
    userId: row.user_id,
    role: row.role,
    teamTag: row.team_tag ?? undefined,
    createdAt: row.created_at,
    fansub: fansubRow
      ? {
        id: fansubRow.id,
        name: fansubRow.name,
        slug: fansubRow.slug,
        avatarUrl: fansubRow.avatar_url ?? undefined,
      }
      : undefined,
  }
}

export function mapDbFansubMemberForManagement(row: DbFansubMemberForManagementRow): FansubMemberForManagement {
  const userRow = getSingleRelation(row.user)
  return {
    fansubId: row.fansub_id,
    userId: row.user_id,
    role: row.role,
    teamTag: row.team_tag ?? undefined,
    createdAt: row.created_at,
    user: userRow
      ? {
        id: userRow.id,
        username: userRow.username,
        avatarUrl: userRow.avatar_url ?? undefined,
      }
      : undefined,
  }
}

export function mapDbFansubInvite(row: DbFansubInviteRow): FansubInvite {
  const fansubRow = getSingleRelation(row.fansub)
  const invitedUserRow = getSingleRelation(row.invited_user)
  const invitedByRow = getSingleRelation(row.invited_by_user)

  return {
    id: row.id,
    fansubId: row.fansub_id,
    invitedUserId: row.invited_user_id,
    invitedByUserId: row.invited_by_user_id,
    role: row.role,
    note: row.note ?? undefined,
    status: row.status,
    respondedAt: row.responded_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fansub: fansubRow
      ? {
        id: fansubRow.id,
        name: fansubRow.name,
        slug: fansubRow.slug,
        avatarUrl: fansubRow.avatar_url ?? undefined,
      }
      : undefined,
    invitedUser: invitedUserRow
      ? {
        id: invitedUserRow.id,
        username: invitedUserRow.username,
        avatarUrl: invitedUserRow.avatar_url ?? undefined,
      }
      : undefined,
    invitedByUser: invitedByRow
      ? {
        id: invitedByRow.id,
        username: invitedByRow.username,
        avatarUrl: invitedByRow.avatar_url ?? undefined,
      }
      : undefined,
  }
}

export function mapDbFansubJoinRequest(row: DbFansubJoinRequestRow): FansubJoinRequest {
  const fansubRow = getSingleRelation(row.fansub)
  const requesterRow = getSingleRelation(row.requester)

  return {
    id: row.id,
    fansubId: row.fansub_id,
    requesterUserId: row.requester_user_id,
    message: row.message ?? undefined,
    status: row.status,
    reviewNote: row.review_note ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fansub: fansubRow
      ? {
        id: fansubRow.id,
        name: fansubRow.name,
        slug: fansubRow.slug,
        avatarUrl: fansubRow.avatar_url ?? undefined,
      }
      : undefined,
    requester: requesterRow
      ? {
        id: requesterRow.id,
        username: requesterRow.username,
        avatarUrl: requesterRow.avatar_url ?? undefined,
      }
      : undefined,
  }
}

export function sortFansubMembersForManagement(a: FansubMemberForManagement, b: FansubMemberForManagement) {
  const roleDiff = FANSUB_MEMBER_ROLE_RANK[a.role] - FANSUB_MEMBER_ROLE_RANK[b.role]
  if (roleDiff !== 0) return roleDiff
  return a.createdAt.localeCompare(b.createdAt)
}
