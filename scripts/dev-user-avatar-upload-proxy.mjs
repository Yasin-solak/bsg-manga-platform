import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const AVATAR_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

function json(res, status, payload) {
  res.statusCode = status
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let exceeded = false

    req.on('data', (chunk) => {
      if (exceeded) return
      size += Buffer.byteLength(chunk)
      if (size > 11 * 1024 * 1024) { exceeded = true; reject(new Error('Görsel isteği çok büyük.')); return }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    req.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    req.on('error', reject)
  })
}

function normalizeSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function getFileExtension(file) {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : null
  if (fromName && fromName.trim()) return fromName.toLowerCase()

  const mimeMap = {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }

  return mimeMap[file.type] || 'bin'
}

function buildAvatarObjectPath(authUserId, file) {
  const normalizedAuthUserId = normalizeSegment(authUserId) || 'unknown-user'
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `user-avatars/${normalizedAuthUserId}/${token}.${getFileExtension(file)}`
}

async function parseFormData(req) {
  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.includes('multipart/form-data')) {
    throw new Error('The avatar upload request must be multipart/form-data.')
  }

  const body = await readBody(req)
  const request = new Request('http://localhost/api/storage/upload', {
    method: req.method || 'POST',
    headers: {
      'content-type': contentType,
    },
    body,
  })

  return request.formData()
}

async function resolveAuthUserId(supabaseUrl, anonKey, accessToken) {
  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  const { data, error } = await authClient.auth.getUser(accessToken)
  if (error || !data.user?.id) {
    throw new Error('The user session could not be verified.')
  }

  return data.user.id
}

function resolveBearerToken(req) {
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function assertAvatarFile(file) {
  if (!(file instanceof File)) {
    throw new Error('User avatar file not found.')
  }

  if (!AVATAR_ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type for a user avatar: ${file.type}`)
  }

  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error('A user avatar cannot exceed the 2MB limit.')
  }
}

export function createDevUserAvatarUploadMiddleware() {
  loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const missingConfigMessage =
    'Lokal avatar upload proxy icin VITE_SUPABASE_URL/SUPABASE_URL, '
    + 'VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY gerekli. '
    + getAdminEnvSetupHint()

  return async function devUserAvatarUploadMiddleware(req, res, next) {
    if (req.method !== 'POST' || !req.url || !req.url.startsWith('/api/storage/upload')) {
      next()
      return
    }


    try {
      const formData = await parseFormData(req)
      const intent = String(formData.get('intent') || '').trim()

      // Announcement images pass the same R2 permission and file checks in development too.
      if (intent === 'announcement-image') {
        const accessToken = resolveBearerToken(req)
        if (!accessToken) { json(res, 401, { error: 'Yönetici oturumu gerekli.' }); return }
        const response = await fetch('https://bsgmanga.pages.dev/api/storage/upload', {
          method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData,
          signal: AbortSignal.timeout(60000),
        })
        const payload = await response.json()
        json(res, response.status, payload)
        return
      }
      if (!supabaseUrl || !anonKey || !serviceRoleKey) { json(res, 500, { error: missingConfigMessage }); return }
      if (intent !== 'user-avatar') {
        json(res, 501, { error: 'Lokal upload proxy su an yalniz user-avatar intentini destekliyor.' })
        return
      }

      const accessToken = resolveBearerToken(req)
      if (!accessToken) {
        json(res, 401, { error: 'Kullanici oturumu bulunamadi.' })
        return
      }

      const file = formData.get('file')
      assertAvatarFile(file)

      const authUserId = await resolveAuthUserId(supabaseUrl, anonKey, accessToken)
      const objectPath = buildAvatarObjectPath(authUserId, file)

      const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      })

      const uploadResult = await serviceClient.storage.from('avatars').upload(objectPath, file, {
        upsert: false,
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
      })

      if (uploadResult.error) {
        json(res, 500, { error: uploadResult.error.message || 'Avatar dosyasi yuklenemedi.' })
        return
      }

      const publicUrl = serviceClient.storage.from('avatars').getPublicUrl(objectPath).data.publicUrl
      json(res, 200, {
        objectPath,
        publicUrl,
      })
    } catch (error) {
      json(res, 500, {
        error: error instanceof Error ? error.message : 'Lokal avatar upload proxy hatasi.',
      })
    }
  }
}
