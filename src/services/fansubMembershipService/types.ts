export type FansubMemberRole = 'admin' | 'moderator' | 'member'

export type FansubInviteRole = 'member' | 'moderator'

export type FansubInviteStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

export type FansubJoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface FansubMembership {
  fansubId: string
  userId: string
  role: FansubMemberRole
  teamTag?: string
  createdAt: string
  fansub?: {
    id: string
    name: string
    slug: string
    avatarUrl?: string
  }
}

export interface FansubInvite {
  id: string
  fansubId: string
  invitedUserId: string
  invitedByUserId: string
  role: FansubInviteRole
  note?: string
  status: FansubInviteStatus
  respondedAt?: string
  createdAt: string
  updatedAt: string
  fansub?: {
    id: string
    name: string
    slug: string
    avatarUrl?: string
  }
  invitedUser?: {
    id: string
    username: string
    avatarUrl?: string
  }
  invitedByUser?: {
    id: string
    username: string
    avatarUrl?: string
  }
}

export interface FansubJoinRequest {
  id: string
  fansubId: string
  requesterUserId: string
  message?: string
  status: FansubJoinRequestStatus
  reviewNote?: string
  reviewedBy?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
  fansub?: {
    id: string
    name: string
    slug: string
    avatarUrl?: string
  }
  requester?: {
    id: string
    username: string
    avatarUrl?: string
  }
}

export interface FansubMemberForManagement {
  fansubId: string
  userId: string
  role: FansubMemberRole
  teamTag?: string
  createdAt: string
  user?: {
    id: string
    username: string
    avatarUrl?: string
  }
}
