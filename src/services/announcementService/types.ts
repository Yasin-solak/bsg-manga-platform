import type { CommunityPost } from '@types'

export type AnnouncementTextAnimation = 'marquee' | 'pulse' | 'blink' | 'slide' | 'none'

export type AdminAnnouncement = {
    id: string
    title: string
    body: string
    status: 'approved'
    isActive: boolean
    primaryColor?: string
    secondaryColor?: string
    announcementCategory?: string
    announcementTextColor?: string
    announcementTextAnimation?: AnnouncementTextAnimation
    announcementActionLabel?: string
    announcementActionUrl?: string
    createdAt: string
    updatedAt: string
    approvedAt?: string
    author: {
        id: string
        username: string
        avatar: string
    }
}

export type DbSiteAnnouncement = {
    id: string
    title: string | null
    body: string | null
    category: string | null
    primary_color: string | null
    secondary_color: string | null
    text_color: string | null
    text_animation: string | null
    action_label: string | null
    action_url: string | null
    is_active: boolean | null
    published_at: string | null
    created_at: string
    updated_at: string
    users?:
        | {
              id: string
              username: string
              avatar_url: string | null
          }
        | Array<{
              id: string
              username: string
              avatar_url: string | null
          }>
}

export type { CommunityPost }
