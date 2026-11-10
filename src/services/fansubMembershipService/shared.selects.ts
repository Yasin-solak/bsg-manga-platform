export const MEMBERSHIP_WORKFLOW_REQUIRED_TABLES = ['fansub_invites', 'fansub_join_requests'] as const

export const FANSUB_MEMBERSHIP_SELECT = `
  fansub_id,
  user_id,
  role,
  team_tag,
  created_at,
  fansub:fansub_id!inner (
    id,
    name,
    slug,
    avatar_url,
    is_active
  )
`

export const FANSUB_MEMBER_MANAGEMENT_SELECT = `
  fansub_id,
  user_id,
  role,
  team_tag,
  created_at,
  fansub:fansub_id!inner (
    id,
    is_active
  ),
  user:user_id (
    id,
    username,
    avatar_url
  )
`

export const FANSUB_INVITE_SELECT = `
  id,
  fansub_id,
  invited_user_id,
  invited_by_user_id,
  role,
  note,
  status,
  responded_at,
  created_at,
  updated_at,
  fansub:fansub_id (
    id,
    name,
    slug,
    avatar_url
  ),
  invited_user:invited_user_id (
    id,
    username,
    avatar_url
  ),
  invited_by_user:invited_by_user_id (
    id,
    username,
    avatar_url
  )
`

export const FANSUB_JOIN_REQUEST_SELECT = `
  id,
  fansub_id,
  requester_user_id,
  message,
  status,
  review_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at,
  fansub:fansub_id (
    id,
    name,
    slug,
    avatar_url
  ),
  requester:requester_user_id (
    id,
    username,
    avatar_url
  )
`
