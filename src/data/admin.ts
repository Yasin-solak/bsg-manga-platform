/**
 * Admin panel mock data.
 * To be replaced with API calls in the backend migration.
 */

export interface DashboardStats {
    users: number
    fansubs: number
    mangas: number
}

export interface AdminUser {
    id: string
    username: string
    avatar: string
    email?: string
    role: 'user' | 'admin' | 'moderator'
    joinDate: string
    lastActive?: string
}

export interface AdminFansub {
    id: string
    name: string
    avatar: string
    mangaCount: number
    followerCount: number
    createdAt: string
}

/** Dashboard istatistikleri – API: GET /admin/stats */
export function getDashboardStats(): DashboardStats {
    return {
        users: 2847,
        fansubs: 12,
        mangas: 89,
    }
}

/** User list. API: GET /admin/users */
export function getAdminUsers(): AdminUser[] {
    return [
        { id: 'u1', username: 'kullanici', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=kullanici', role: 'admin', joinDate: '2023-01-15', lastActive: '2024-12-20' },
        { id: 'u2', username: 'manga_lover_42', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=manga_lover', role: 'user', joinDate: '2024-03-20', lastActive: '2024-12-20' },
        { id: 'u3', username: 'anime_fan_pro', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=anime_fan', role: 'user', joinDate: '2024-05-10', lastActive: '2024-12-19' },
        { id: 'u4', username: 'gecekusu_admin', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin1', role: 'moderator', joinDate: '2023-06-01', lastActive: '2024-12-20' },
        { id: 'u5', username: 'cevirmen_ali', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ali', role: 'user', joinDate: '2024-08-12', lastActive: '2024-12-18' },
    ]
}

/** Fansub listesi – API: GET /admin/fansubs */
export function getAdminFansubs(): AdminFansub[] {
    return [
        { id: '1', name: 'Gecekuşu Çeviri', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=gecekusu', mangaCount: 45, followerCount: 12340, createdAt: '2015-03-10' },
        { id: '2', name: 'Ateş Böceği Mangaları', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ates', mangaCount: 38, followerCount: 9876, createdAt: '2016-08-22' },
        { id: '3', name: 'Bulut Çeviri', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=bulut', mangaCount: 52, followerCount: 15234, createdAt: '2018-01-15' },
    ]
}
