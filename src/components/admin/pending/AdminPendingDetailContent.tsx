import { useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  changeActionLabel,
  formatDateTimeTr,
  mangaStatusLabel,
  normalizeText,
  pendingAuthorEntity,
  pendingLocationLabel,
  type PendingItem,
} from './pendingSectionUtils'
import { PendingPageLightbox, type LightboxPage } from './PendingPageLightbox'
import { AdminEntityHoverCard } from '../shared/AdminEntityHoverCard'
import { resolveChapterPageUrl } from '@/services/assetUrlService'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { AdminChapterStudioReviewButton } from '@/components/admin/chapterReview/AdminChapterStudioReview'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminPendingDetailContentProps {
  item: PendingItem
}

type FansubRequestMeta = NonNullable<PendingItem['requestMeta']>
type MangaSnapshot = NonNullable<NonNullable<PendingItem['mangaDetails']>['revisionAfter']>

/* ---------------- yardimcilar ---------------- */

function Chip({ children, tone = 'muted' }: { children: ReactNode, tone?: 'muted' | 'primary' | 'amber' | 'rose' | 'emerald' }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/12 text-primary',
    amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    rose: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    emerald: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', tones[tone])}>{children}</span>
}

/** Iki sutunlu bilgi izgarasi (tablo yerine). */
function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-muted/30 px-4 py-3 text-[12.5px]">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">{label}</dt>
          <dd className="truncate font-medium text-foreground">{value === '' || value == null ? '—' : value}</dd>
        </div>
      ))}
    </dl>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{children}</h4>
}

function metaText(value: unknown) {
  if (typeof value === 'boolean') return value ? txa('Evet') : txa('Hayır')
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return normalizeText(value) || '—'
  if (Array.isArray(value)) {
    const items = value.map((item) => normalizeText(String(item))).filter(Boolean)
    return items.length ? items.join(', ') : '—'
  }
  return '—'
}

function metaArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeText(String(item))).filter(Boolean)
}

// Basvuru formu ham degerleri (eskiden ekranda "intermediate", "all" diye kaliyordu).
const EXPERIENCE_LABEL: Record<string, string> = { get new() { return txa('Yeni ekip') }, get intermediate() { return txa('Orta') }, get experienced() { return txa('Deneyimli') } }
const AGE_POLICY_LABEL: Record<string, string> = { get all() { return txa('Genel izleyici') }, teen: '13+', mature: '18+' }
const CONTENT_TYPE_LABEL: Record<string, string> = { get manga() { return txa('Manga') }, get manhwa() { return txa('Manhwa') }, get manhua() { return txa('Manhua') }, get webtoon() { return txa('Webtoon') }, get novel() { return txa('Roman') }, get yerli() { return txa('Yerli') } }

function labeled(map: Record<string, string>, value: unknown) {
  return typeof value === 'string' && map[value] ? map[value] : metaText(value)
}

function TagList({ values }: { values: string[] }) {
  if (!values.length) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((value) => <Chip key={value}>{value}</Chip>)}
    </span>
  )
}

/* ---------------- fansub basvurusu ---------------- */

function FansubRequestMetaPanel({ meta }: { meta: FansubRequestMeta }) {
  return (
    <div>
      <SectionTitle>{txa('Başvuru bilgileri')}</SectionTitle>
      <Facts
        rows={[
          [txa('Ekip büyüklüğü'), meta.teamSize ? txa('{v1} kişi', { v1: meta.teamSize }) : '—'],
          [txa('Deneyim'), labeled(EXPERIENCE_LABEL, meta.experienceLevel)],
          [txa('Haftalık hedef'), meta.weeklyReleaseGoal ? txa('{v1} bölüm', { v1: meta.weeklyReleaseGoal }) : '—'],
          [txa('Yaş politikası'), labeled(AGE_POLICY_LABEL, meta.ageRatingPolicy)],
          [txa('E-posta'), metaText(meta.contactEmail)],
          [txa('Discord'), metaText(meta.contactDiscord)],
          [txa('Alım açık mı'), metaText(meta.recruitmentOpen)],
          [txa('DMCA onayı'), `${metaText(meta.dmcaAccepted)} · ${formatDateTimeTr(meta.dmcaAcceptedAt)}`],
        ]}
      />
      <div className="mt-3 grid gap-3 text-[12.5px]">
        <div><span className="mb-1 block text-[11px] text-muted-foreground">{txa('İçerik tipleri')}</span><TagList values={metaArray(meta.contentTypes).map((value) => CONTENT_TYPE_LABEL[value] ?? value)} /></div>
        <div><span className="mb-1 block text-[11px] text-muted-foreground">{txa('Odak türler')}</span><TagList values={metaArray(meta.focusGenres)} /></div>
        <div><span className="mb-1 block text-[11px] text-muted-foreground">{txa('Aradığı roller')}</span><TagList values={metaArray(meta.teamRolesNeeded)} /></div>
        <div>
          <span className="mb-1 block text-[11px] text-muted-foreground">{txa('Portfolyo / ek not')}</span>
          <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">{metaText(meta.portfolioNotes)}</p>
        </div>
      </div>
    </div>
  )
}

/* ---------------- manga revizyon karsilastirmasi ---------------- */

const MANGA_FIELDS: Array<{ key: keyof MangaSnapshot, label: string }> = [
  { key: 'title', get label() { return txa('Başlık') } },
  { key: 'slug', get label() { return txa('Adres') } },
  { key: 'status', get label() { return txa('Yayın durumu') } },
  { key: 'genres', get label() { return txa('Türler') } },
  { key: 'author', get label() { return txa('Yazar') } },
  { key: 'artist', get label() { return txa('Çizer') } },
  { key: 'isMature', label: '+18' },
  { key: 'description', get label() { return txa('Açıklama') } },
  { key: 'coverImageUrl', get label() { return txa('Kapak') } },
]

function fieldText(key: keyof MangaSnapshot, value: unknown) {
  if (value == null || value === '') return '—'
  if (key === 'status') return mangaStatusLabel(String(value))
  if (key === 'isMature') return value ? txa('Evet') : txa('Hayır')
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  return normalizeText(String(value)) || '—'
}

function sameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
  return (a ?? '') === (b ?? '')
}

/** Only changed fields as "old -> new"; unchanged ones collapse. */
function MangaRevisionDiff({ before, after }: { before: MangaSnapshot, after: MangaSnapshot }) {
  const [showSame, setShowSame] = useState(false)
  const changed = MANGA_FIELDS.filter((field) => !sameValue(before[field.key], after[field.key]))
  const same = MANGA_FIELDS.filter((field) => sameValue(before[field.key], after[field.key]))
  return (
    <div data-testid="admin-pending-manga-diff">
      <SectionTitle>{txa('Değişiklikler ({v1})', { v1: changed.length })}</SectionTitle>
      {changed.length === 0 ? (
        <p className="rounded-xl bg-muted/30 px-4 py-3 text-[12.5px] text-muted-foreground">{txa('Alanlarda fark yok.')}</p>
      ) : (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/70">
          {changed.map((field) => (
            <li key={field.key} className="grid gap-1 px-4 py-2.5 text-[12.5px]">
              <span className="text-[11px] font-semibold text-muted-foreground">{field.label}</span>
              {field.key === 'coverImageUrl' ? (
                <span className="flex items-center gap-3">
                  <img src={String(before.coverImageUrl || buildCoverPlaceholder(txa('Kapak')))} alt={txa('Önceki kapak')} className="h-20 w-14 rounded-md border border-border object-cover opacity-70" />
                  <ArrowRight className="size-4 text-muted-foreground" />
                  <img src={String(after.coverImageUrl || buildCoverPlaceholder(txa('Kapak')))} alt={txa('Yeni kapak')} className="h-20 w-14 rounded-md border border-primary/50 object-cover" />
                </span>
              ) : (
                <span className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start sm:gap-2">
                  <span className={cn('break-words text-muted-foreground line-through decoration-rose-500/50', field.key === 'description' && 'line-clamp-4')}>
                    {fieldText(field.key, before[field.key])}
                  </span>
                  <ArrowRight className="hidden size-3.5 text-muted-foreground sm:mt-0.5 sm:block" />
                  <span className={cn('break-words font-medium text-foreground', field.key === 'description' && 'line-clamp-6')}>
                    {fieldText(field.key, after[field.key])}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {same.length ? (
        <button type="button" onClick={() => setShowSame((value) => !value)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn('size-3.5 transition-transform', showSame && 'rotate-180')} />
          {txa('Değişmeyen alanlar ({v1})', { v1: same.length })}
        </button>
      ) : null}
      {showSame ? (
        <Facts rows={same.filter((field) => field.key !== 'coverImageUrl' && field.key !== 'description').map((field) => [field.label, fieldText(field.key, after[field.key])])} />
      ) : null}
    </div>
  )
}

/* ---------------- chapter pages ---------------- */

const PAGE_BORDER = { rose: 'border-rose-500/40', emerald: 'border-emerald-500/40', muted: 'border-border' } as const

/**
 * Page thumbnails; a click opens the large preview (PendingPageLightbox) with `offset + index`.
 * No nested scrolling: the detail panel already scrolls inside itself.
 */
function PageGrid({ title, pages, offset, emptyText, tone, onOpen }: {
  title: string
  pages: LightboxPage[]
  offset: number
  emptyText: string
  tone: keyof typeof PAGE_BORDER
  onOpen: (index: number) => void
}) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      {pages.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
          {pages.map((page, index) => (
            <button
              key={`${page.url}-${index}`}
              type="button"
              onClick={() => onOpen(offset + index)}
              aria-label={txa('{v1}: büyüt', { v1: page.label })}
              className={cn('group relative overflow-hidden rounded-md border-2 bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring', PAGE_BORDER[tone])}
              data-testid="admin-pending-page-thumb"
            >
              <img src={page.url} alt="" loading="lazy" className="h-[108px] w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]" />
              <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 text-[10px] font-bold tabular-nums text-white">{index + 1}</span>
              <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Maximize2 className="size-4 text-white" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** All pages for a new chapter; removed + added pages for a published chapter's revision. */
function ChapterPages({ item }: { item: PendingItem }) {
  const d = item.chapterDetails
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const resolve = (url: string) => resolveChapterPageUrl(url) || url
  const isRevision = Boolean(item.revisionId) || d?.changeAction === 'edit'

  if (!isRevision) {
    const pages = (d?.afterPages || []).map((url, index) => ({ url: resolve(url), label: txa('Sayfa {v1}', { v1: index + 1 }) }))
    return (
      <>
        <NewRecordNotice text={txa('Yeni bölüm talebi: sayfalarıyla birlikte ilk kez yayına alınacak. Sayfaya tıklayınca büyük açılır.')} />
        <PageGrid title={txa('Sayfalar ({v1})', { v1: pages.length })} pages={pages} offset={0} emptyText={txa('Bu bölümde sayfa yok.')} tone="muted" onOpen={setLightboxIndex} />
        <PendingPageLightbox pages={pages} index={lightboxIndex} onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      </>
    )
  }

  const removed: LightboxPage[] = (d?.removedPages || []).map((url, index) => ({ url: resolve(url), label: txa('Çıkan sayfa {v1}', { v1: index + 1 }), tone: 'rose' }))
  const added: LightboxPage[] = (d?.addedPages || []).map((url, index) => ({ url: resolve(url), label: txa('Eklenen sayfa {v1}', { v1: index + 1 }), tone: 'emerald' }))
  if (!removed.length && !added.length) {
    return <NewRecordNotice text={d?.reordered ? txa('Sayfalar aynı; yalnız sıraları değişti.') : txa('Bu revizyonda sayfa değişikliği yok.')} />
  }
  const pages = [...removed, ...added]
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <PageGrid title={txa('Çıkan sayfalar ({v1})', { v1: removed.length })} pages={removed} offset={0} emptyText={txa('Çıkarılan sayfa yok.')} tone="rose" onOpen={setLightboxIndex} />
        <PageGrid title={txa('Eklenen sayfalar ({v1})', { v1: added.length })} pages={added} offset={removed.length} emptyText={txa('Yeni sayfa yok.')} tone="emerald" onOpen={setLightboxIndex} />
      </div>
      <PendingPageLightbox pages={pages} index={lightboxIndex} onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
    </>
  )
}

/** Revision of published content: the reader sees the old version until the decision. */
function LiveRevisionNotice() {
  return (
    <p className="rounded-xl border border-amber-500/35 bg-amber-500/[0.06] px-4 py-2.5 text-[12px] text-muted-foreground" data-testid="admin-pending-live-revision">
      <b className="font-semibold text-foreground">{txa('Yayındaki içeriğin revizyonu.')}</b>{' '}
      {txa('Onaylanana kadar okurlar mevcut sürümü görür; onayda yeni sürüm yayına geçer, önceki arşivlenir (Mangalar › Revizyonlar). Reddedilirse mevcut sürüm kalır.')}
    </p>
  )
}

function NewRecordNotice({ text }: { text: string }) {
  return <p className="rounded-xl bg-primary/[0.07] px-4 py-3 text-[12.5px] text-foreground">{text}</p>
}

/* ---------------- ana bilesen ---------------- */

export function AdminPendingDetailContent({ item }: AdminPendingDetailContentProps) {
  const author = pendingAuthorEntity(item)
  const authorCard = <AdminEntityHoverCard kind={author.kind} entityKey={author.key}>{item.author}</AdminEntityHoverCard>

  if (item.type === 'manga') {
    const d = item.mangaDetails
    const before = d?.revisionBefore || null
    const after = d?.revisionAfter || null
    const hasRevisionDiff = d?.changeAction === 'edit' && Boolean(before && after)

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <img
            src={d?.coverImage || buildCoverPlaceholder(item.title)}
            alt={item.title}
            className="h-[118px] w-[84px] shrink-0 rounded-lg border border-border object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone={d?.changeAction === 'edit' ? 'amber' : 'primary'}>{changeActionLabel(d?.changeAction)}</Chip>
              <Chip>{mangaStatusLabel(d?.status)}</Chip>
              {d?.isActive === false ? <Chip tone="rose">{txa('Pasif')}</Chip> : null}
            </div>
            <p className="mt-2 line-clamp-4 text-[12.5px] leading-relaxed text-muted-foreground">{item.description || txa('Açıklama yok.')}</p>
          </div>
        </div>

        {item.revisionId ? <LiveRevisionNotice /> : null}

        {d?.revisionNote ? (
          <div className="rounded-xl bg-muted/30 px-4 py-3" data-testid="admin-pending-revision-note">
            <SectionTitle>{txa('Ekibin notu')}</SectionTitle>
            <p className="whitespace-pre-wrap break-words text-[13px] text-foreground">{d.revisionNote}</p>
          </div>
        ) : null}

        {hasRevisionDiff && before && after ? <MangaRevisionDiff before={before} after={after} /> : null}

        <Facts
          rows={[
            [txa('Fansub'), authorCard],
            [txa('Yazar / çizer'), `${d?.authorName || '—'} / ${d?.artistName || '—'}`],
            [txa('Türler'), d?.genres?.length ? d.genres.join(', ') : '—'],
            [txa('Son bölüm'), d?.lastChapterNumber ?? '—'],
            [txa('Takipçi / okunma'), `${(d?.followerCount ?? 0).toLocaleString(intlLocale())} / ${(d?.totalViews ?? 0).toLocaleString(intlLocale())}`],
            [txa('Puan'), d?.rating != null ? txa('{v1} ({v2} oy)', { v1: d.rating, v2: d.totalRatings || 0 }) : '—'],
            [txa('Gönderim'), formatDateTimeTr(d?.revisionCreatedAt || item.createdAt)],
            [txa('Adres'), d?.slug],
          ]}
        />

        {!hasRevisionDiff ? <NewRecordNotice text={txa('Yeni seri talebi: onaylanınca yayına çıkar.')} /> : null}
      </div>
    )
  }

  if (item.type === 'chapter') {
    const d = item.chapterDetails
    const titleChanged = Boolean(d?.beforeTitle) && normalizeText(d?.beforeTitle) !== normalizeText(d?.afterTitle || d?.chapterTitle)

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <img
            src={d?.mangaCover || buildCoverPlaceholder(d?.mangaTitle || txa('Bölüm'))}
            alt={d?.mangaTitle || txa('Manga')}
            className="h-[118px] w-[84px] shrink-0 rounded-lg border border-border object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">
              <AdminEntityHoverCard kind="manga" entityKey={d?.mangaId || d?.mangaSlug}>{d?.mangaTitle || item.title}</AdminEntityHoverCard>
            </p>
            <p className="text-[12.5px] text-muted-foreground">{typeof d?.chapterNumber === 'number' ? txa('{v1}. bölüm', { v1: d.chapterNumber }) : txa('Bölüm')}{normalizeText(d?.afterTitle || d?.chapterTitle) ? ` · ${normalizeText(d?.afterTitle || d?.chapterTitle)}` : ''}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone={d?.changeAction === 'edit' ? 'amber' : 'primary'}>{changeActionLabel(d?.changeAction)}</Chip>
              <Chip>{txa('{v1} sayfa', { v1: d?.pageCount ?? 0 })}</Chip>
              {d?.reordered ? <Chip tone="amber">{txa('Sıra değişti')}</Chip> : null}
              {d?.isActive === false ? <Chip tone="rose">{txa('Pasif')}</Chip> : null}
            </div>
            {/* Studyo ile yuklenen bolumde ham sayfalar, metinler ve yeni dil. */}
            <div className="mt-2"><AdminChapterStudioReviewButton chapterId={item.chapterId ?? item.id} className="min-h-9" /></div>
          </div>
        </div>

        <Facts
          rows={[
            [txa('Fansub'), authorCard],
            [txa('Yayın'), formatDateTimeTr(d?.afterPublishAt || d?.publishAt)],
            [txa('Sayfa (önceki → yeni)'), d?.beforePages?.length ? `${d.beforePages.length} → ${(d?.afterPages || []).length || d?.pageCount || 0}` : `${(d?.afterPages || []).length || d?.pageCount || 0}`],
            [txa('Gönderim'), formatDateTimeTr(d?.revisionCreatedAt || item.createdAt)],
            ...(titleChanged ? [[txa('Başlık (önceki → yeni)'), `${normalizeText(d?.beforeTitle)} → ${normalizeText(d?.afterTitle || d?.chapterTitle) || '—'}`] as [string, ReactNode]] : []),
            ...(d?.beforePublishAt && d.beforePublishAt !== (d.afterPublishAt || d.publishAt)
              ? [[txa('Önceki yayın'), formatDateTimeTr(d.beforePublishAt)] as [string, ReactNode]]
              : []),
          ]}
        />

        {item.revisionId ? <LiveRevisionNotice /> : null}

        <ChapterPages key={item.id} item={item} />
      </div>
    )
  }

  if (item.type === 'fansub_request') {
    const requestMeta = item.requestMeta
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="emerald">{txa('Yeni ekip başvurusu')}</Chip>
          {item.requestedSlug ? <Chip>/{item.requestedSlug}</Chip> : null}
          {requestMeta?.dmcaAccepted ? <Chip tone="primary">{txa('DMCA onaylı')}</Chip> : <Chip tone="amber">{txa('DMCA onayı yok')}</Chip>}
        </div>

        <Facts
          rows={[
            [txa('Başvuran'), authorCard],
            [txa('Konum'), pendingLocationLabel(item)],
            [txa('Başvuru'), formatDateTimeTr(item.createdAt)],
            [txa('İstenen adres'), item.requestedSlug],
          ]}
        />

        <div>
          <SectionTitle>{txa('Başvuru metni')}</SectionTitle>
          <p className="whitespace-pre-wrap rounded-xl bg-muted/30 px-4 py-3 text-[13px] leading-relaxed text-foreground">
            {normalizeText(item.requestedDescription) || normalizeText(item.description) || txa('Açıklama girilmemiş.')}
          </p>
        </div>

        {requestMeta
          ? <FansubRequestMetaPanel meta={requestMeta} />
          : <p className="rounded-xl bg-muted/30 px-4 py-3 text-[12.5px] text-muted-foreground">{txa('Bu başvuruda ayrıntılı form verisi yok (eski form).')}</p>}
      </div>
    )
  }

  return <p className="py-8 text-center text-sm text-muted-foreground">{txa('Ayrıntı bulunamadı.')}</p>
}
