import { supabase } from '../supabase'
import { convertToWebP } from '@/utils/webpConverter'

import { isAnimatedImageFile, normalizeUploadFile } from './mediaFileNormalization'

export type StorageTarget = 'manga_cover' | 'chapter_page' | 'fansub_avatar' | 'user_avatar' | 'store_asset'

export type TargetConfig = {
    bucket: 'manga-covers' | 'chapter-pages' | 'avatars' | 'store-assets'
    maxSizeMb: number
    allowedMimeTypes: string[]
    autoWebP?: boolean
}

export const STORAGE_TARGETS: Record<StorageTarget, TargetConfig> = {
    manga_cover: {
        bucket: 'manga-covers',
        maxSizeMb: 10,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        autoWebP: true,
    },
    chapter_page: {
        bucket: 'chapter-pages',
        maxSizeMb: 15,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        autoWebP: true,
    },
    fansub_avatar: {
        bucket: 'avatars',
        maxSizeMb: 2,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        autoWebP: true,
    },
    user_avatar: {
        bucket: 'avatars',
        maxSizeMb: 2,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        autoWebP: true,
    },
    store_asset: {
        bucket: 'store-assets',
        maxSizeMb: 10,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
        autoWebP: false,
    },
}

export function normalizeSegment(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120)
}

export function getFileExtension(file: File): string {
    const normalizedFromName = file.name.includes('.') ? String(file.name.split('.').pop() || '').trim().toLowerCase() : ''
    if (normalizedFromName) return normalizedFromName

    const mimeMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
    }
    return mimeMap[file.type] ?? 'bin'
}

export function assertFileAllowed(file: File, target: StorageTarget): void {
    const config = STORAGE_TARGETS[target]
    if (!config.allowedMimeTypes.includes(file.type)) {
        throw new Error(`Desteklenmeyen dosya tipi: ${file.type}`)
    }

    const maxBytes = config.maxSizeMb * 1024 * 1024
    if (file.size > maxBytes) {
        throw new Error(`Dosya boyutu ${config.maxSizeMb}MB limitini asiyor.`)
    }
}

export function buildObjectPath(basePath: string, file: File): string {
    const ext = getFileExtension(file)
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    return `${basePath}/${token}.${ext}`
}

export async function uploadPublicFile(
    target: StorageTarget,
    basePath: string,
    file: File,
    options: {
        response?: 'publicUrl' | 'objectPath'
    } = {},
): Promise<string> {
    const normalizedUpload = await normalizeUploadFile(file)
    assertFileAllowed(normalizedUpload.file, target)

    const config = STORAGE_TARGETS[target]
    const responseMode = options.response || 'publicUrl'

    let finalFile = normalizedUpload.file
    const shouldSkipWebPConversion = await isAnimatedImageFile(finalFile)

    if (config.autoWebP && finalFile.type.startsWith('image/') && finalFile.type !== 'image/gif' && !shouldSkipWebPConversion) {
        try {
            finalFile = await convertToWebP(finalFile)
            if (import.meta.env.DEV) console.log(`[Storage] WebP donusum: ${normalizedUpload.file.name} (${(normalizedUpload.file.size / 1024).toFixed(0)}KB) -> ${finalFile.name} (${(finalFile.size / 1024).toFixed(0)}KB)`)
        } catch (err) {
            console.warn('[Storage] WebP donusum basarisiz, orijinal kullaniliyor:', err)
            finalFile = normalizedUpload.file
        }
    }

    const bucket = config.bucket
    const objectPath = buildObjectPath(basePath, finalFile)
    const { error } = await supabase.storage.from(bucket).upload(objectPath, finalFile, {
        upsert: false,
        cacheControl: '3600',
    })

    if (error) throw error
    if (responseMode === 'objectPath') return objectPath

    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath)
    return data.publicUrl
}