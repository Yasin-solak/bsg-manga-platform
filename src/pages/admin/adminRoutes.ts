import type { AdminSection } from './adminPageUtils'

const SECTION_TO_SEGMENT: Record<AdminSection, string> = {
  dashboard: '',
  support: 'destek',
  diagnostics: 'tanilama',
  boost: 'takviye',
  supporter_assets: 'emoji-cikartma',
  pending: 'onay-bekleyenler',
  community: 'topluluk',
  comments: 'yorumlar',
  legal_requests: 'yasal-talepler',
  reports: 'raporlar',
  announcements: 'duyurular',
  users: 'kullanicilar',
  mangas: 'mangalar',
  lists: 'listeler',
  series_requests: 'seri-talepleri',
  translation_studio: 'ceviri-studyosu',
  store: 'magaza',
  coin_codes: 'coin-kodlari',
  rewards: 'oduller',
  games: 'oyunlar',
  text_translations: 'metin-cevirileri',
  fansubs: 'fansublar',
  operations: 'operasyon',
  settings: 'ayarlar',
}

const SEGMENT_TO_SECTION = Object.entries(SECTION_TO_SEGMENT).reduce(
  (acc, [section, segment]) => {
    const normalizedSegment = segment.trim().toLowerCase()
    if (normalizedSegment.length > 0) {
      acc[normalizedSegment] = section as AdminSection
    }
    return acc
  },
  {} as Record<string, AdminSection>,
)

export const ADMIN_DEFAULT_SECTION: AdminSection = 'dashboard'

export function sectionToAdminPath(section: AdminSection): string {
  const segment = SECTION_TO_SEGMENT[section]
  if (!segment) return '/admin'
  return `/admin/${segment}`
}

export function sectionFromAdminPath(pathname: string): AdminSection {
  const normalized = pathname.trim().toLowerCase()
  if (!normalized.startsWith('/admin')) return ADMIN_DEFAULT_SECTION

  const rest = normalized.slice('/admin'.length).replace(/^\/+/, '')
  if (!rest) return ADMIN_DEFAULT_SECTION

  const firstSegment = rest.split('/')[0] ?? ''
  return SEGMENT_TO_SECTION[firstSegment] ?? ADMIN_DEFAULT_SECTION
}

export function isKnownAdminPath(pathname: string): boolean {
  const normalized = pathname.trim().toLowerCase()
  if (normalized === '/admin' || normalized === '/admin/') return true
  if (!normalized.startsWith('/admin/')) return false
  const firstSegment = normalized.slice('/admin/'.length).split('/')[0] ?? ''
  return firstSegment.length > 0 && firstSegment in SEGMENT_TO_SECTION
}
