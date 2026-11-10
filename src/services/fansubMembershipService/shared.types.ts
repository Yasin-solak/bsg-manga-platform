import type {
  FansubInvite,
  FansubInviteRole,
  FansubInviteStatus,
  FansubJoinRequest,
  FansubJoinRequestStatus,
  FansubMemberForManagement,
  FansubMemberRole,
  FansubMembership,
} from './types'

export interface DbFansubMembershipRow {
  fansub_id: string
  user_id: string
  role: FansubMemberRole
  team_tag: string | null
  created_at: string
  fansub?: DbFansubRelationRow | DbFansubRelationRow[] | null
}

export interface DbFansubInviteRow {
  id: string
  fansub_id: string
  invited_user_id: string
  invited_by_user_id: string
  role: FansubInviteRole
  note: string | null
  status: FansubInviteStatus
  responded_at: string | null
  created_at: string
  updated_at: string
  fansub?: DbFansubRelationRow | DbFansubRelationRow[] | null
  invited_user?: DbUserRelationRow | DbUserRelationRow[] | null
  invited_by_user?: DbUserRelationRow | DbUserRelationRow[] | null
}

export interface DbFansubJoinRequestRow {
  id: string
  fansub_id: string
  requester_user_id: string
  message: string | null
  status: FansubJoinRequestStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  fansub?: DbFansubRelationRow | DbFansubRelationRow[] | null
  requester?: DbUserRelationRow | DbUserRelationRow[] | null
}

export interface DbFansubMemberForManagementRow {
  fansub_id: string
  user_id: string
  role: FansubMemberRole
  team_tag: string | null
  created_at: string
  user?: DbUserRelationRow | DbUserRelationRow[] | null
}

export interface DbFansubRelationRow {
  id: string
  name: string
  slug: string
  avatar_url: string | null
}

export interface DbUserRelationRow {
  id: string
  username: string
  avatar_url: string | null
}

export interface SupabaseErrorLike {
  code?: string
  message?: string
  hint?: string | null
}

export type FansubMembershipSharedModel =
  | FansubMembership
  | FansubInvite
  | FansubJoinRequest
  | FansubMemberForManagement
