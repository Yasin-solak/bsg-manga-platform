import { useCallback, useEffect, useState } from 'react'
import { Archive, Check, History, RefreshCw, RotateCcw, X } from 'lucide-react'
import {
  approveContentRevision,
  changedRevisionKeys,
  listContentRevisions,
  rejectContentRevision,
  restoreContentRevision,
  revisionPages,
  type ContentRevision,
  type ContentRevisionScope,
} from '@/services/contentRevisionService'
import { resolveChapterPageUrl } from '@/services/assetUrlService'
import { confirmDialog } from '@/services/confirmService'
import { toast } from '@/services/toastService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Manga Control > Revisions / archive.
 *
 * Pending: a change awaiting approval on a published series/chapter (the reader sees the old
 * version). Archive: the PREVIOUS version taken down by approved changes
 * (before_data). Old chapter pages are not deleted from storage; a site admin can revert with
 * "Back to this version" (the server checks is_admin in restore_content_revision).
 */

const FIELD_LABEL: Record<string, string> = {
  title: txa('Başlık'),
  description: txa('Açıklama'),
  genres: txa('Türler'),
  cover_image_url: txa('Kapak'),
  is_mature: '+18',
  status: 'Durum',
  author: txa('Yazar'),
  artist: txa('Çizer'),
  pages: txa('Sayfalar'),
  page_dimensions: txa('Sayfa ölçüleri'),
  publish_at: txa('Yayın zamanı'),
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(intlLocale())
}

function describeValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'is_mature') return value === true ? txa('Evet') : txa('Hayır')
  if (key === 'pages') return txa('{v1} sayfa', { v1: revisionPages(value).length })
  if (key === 'page_dimensions') return txa('güncellendi')
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (key === 'publish_at' && typeof value === 'string') return formatDate(value)
  return String(value)
}

function PageStrip({ label, pages }: { label: string, pages: string[] }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="m-0 text-[11px] font-semibold text-muted-foreground">{txa('{v1} · {v2} sayfa', { v1: label, v2: pages.length })}</p>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {pages.slice(0, 8).map((ref, index) => (
          <img
            key={`${ref}-${index}`}
            src={resolveChapterPageUrl(ref) || ref}
            alt={txa('Sayfa {v1}', { v1: index + 1 })}
            loading="lazy"
            className="h-20 w-14 shrink-0 rounded border border-border bg-muted object-cover"
          />
        ))}
      </div>
    </div>
  )
}

function RevisionCard({ revision, scope, busy, onApprove, onReject, onRestore }: {
  revision: ContentRevision
  scope: ContentRevisionScope
  busy: boolean
  onApprove: () => void
  onReject: () => void
  onRestore: () => void
}) {
  // Dimensions change with pages; not shown as a separate row.
  const keys = changedRevisionKeys(revision).filter((key) => key !== 'page_dimensions')
  const isChapter = revision.targetType === 'chapter'
  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-3" data-testid="admin-content-revision">
      <div className="flex flex-wrap items-start gap-3">
        {revision.mangaCover ? (
          <img src={revision.mangaCover} alt="" className="h-16 w-11 shrink-0 rounded border border-border object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-medium text-foreground">
            {revision.mangaTitle || txa('Seri')}
            {isChapter ? <span className="text-muted-foreground"> {txa('· {v1}. Bölüm', { v1: revision.chapterNumber ?? '' })}</span> : null}
          </p>
          <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
            {revision.fansubName || txa('Ekip yok')} · {txa('gönderen')} {revision.requestedBy || '—'} · {formatDate(revision.createdAt)}
            {scope === 'archive' ? txa(' · onaylayan {v1} · {v2}', { v1: revision.reviewedBy || '—', v2: formatDate(revision.reviewedAt) }) : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Badge variant="outline" className="rounded-full text-[10px]">{isChapter ? txa('Bölüm') : txa('Seri')}</Badge>
          {revision.source === 'studio' ? <Badge variant="secondary" className="rounded-full text-[10px]">{txa('Stüdyo')}</Badge> : null}
          {revision.source === 'restore' ? <Badge variant="secondary" className="rounded-full text-[10px]">{txa('Geri alma')}</Badge> : null}
          {revision.restored ? <Badge variant="default" className="rounded-full text-[10px]">{txa('Geri alındı')}</Badge> : null}
        </div>
      </div>

      <div className="grid gap-1.5 text-xs">
        {keys.filter((key) => key !== 'pages').map((key) => (
          <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <span className="font-medium text-muted-foreground">{FIELD_LABEL[key] ?? key}</span>
            <span className="truncate text-muted-foreground line-through decoration-muted-foreground/50" title={describeValue(key, revision.before[key])}>
              {describeValue(key, revision.before[key])}
            </span>
            <span className="truncate text-foreground" title={describeValue(key, revision.after[key])}>{describeValue(key, revision.after[key])}</span>
          </div>
        ))}
      </div>

      {keys.includes('pages') ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <PageStrip label={scope === 'archive' ? txa('Arşivdeki önceki sürüm') : txa('Yayındaki sürüm')} pages={revisionPages(revision.before.pages)} />
          <PageStrip label={scope === 'archive' ? txa('Yayına geçen sürüm') : txa('Önerilen sürüm')} pages={revisionPages(revision.after.pages)} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {scope === 'pending' ? (
          <>
            <Button type="button" size="sm" className="min-h-11" disabled={busy} onClick={onApprove}>
              <Check className="size-3.5" aria-hidden="true" />
              {txa('Onayla (yayına al)')}
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={onReject}>
              <X className="size-3.5" aria-hidden="true" />
              {txa('Reddet (eski sürüm kalır)')}
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={onRestore} data-testid="admin-content-revision-restore">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {txa('Bu önceki sürüme geri dön')}
          </Button>
        )}
      </div>
    </article>
  )
}

export function ContentRevisionsPanel() {
  const [scope, setScope] = useState<ContentRevisionScope>('pending')
  const [revisions, setRevisions] = useState<ContentRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (nextScope: ContentRevisionScope, signal?: AbortSignal) => {
    setLoading(true)
    try {
      const rows = await listContentRevisions(nextScope, signal)
      if (signal?.aborted) return
      setRevisions(rows)
      setError(null)
    } catch (loadError) {
      if (!signal?.aborted) setError(toUserFacingErrorMessage(loadError, txa('Revizyonlar yüklenemedi.')))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(scope, controller.signal)
    return () => controller.abort()
  }, [load, scope])

  async function run(revision: ContentRevision, action: 'approve' | 'reject' | 'restore') {
    if (action === 'restore') {
      const confirmed = await confirmDialog({
        title: txa('Önceki sürüme dön'),
        message: txa('Arşivdeki sürüm yeniden yayına alınacak; şu anki sürüm de arşive düşer. Devam edilsin mi?'),
        confirmText: txa('Geri al'),
        cancelText: txa('Vazgeç'),
        variant: 'warning',
      })
      if (!confirmed) return
    }
    setBusyId(revision.id)
    try {
      if (action === 'approve') await approveContentRevision(revision.id)
      if (action === 'reject') await rejectContentRevision(revision.id)
      if (action === 'restore') await restoreContentRevision(revision.id)
      toast.success(action === 'approve' ? txa('Revizyon yayına alındı; önceki sürüm arşivlendi.') : action === 'reject' ? txa('Revizyon reddedildi; mevcut sürüm yayında.') : txa('Önceki sürüm yeniden yayında.'))
      await load(scope)
    } catch (actionError) {
      toast.error(toUserFacingErrorMessage(actionError, txa('İşlem tamamlanamadı.')))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-3" data-testid="admin-content-revisions">
      <div className="flex flex-wrap items-center gap-2">
        {([['pending', txa('Bekleyen revizyonlar'), History], ['archive', txa('Arşiv (önceki sürümler)'), Archive]] as const).map(([key, label, Icon]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={scope === key ? 'secondary' : 'outline'}
            className={cn('min-h-11 rounded-lg px-3 text-xs', scope === key && 'border-primary/30 bg-primary/10 text-primary')}
            aria-pressed={scope === key}
            onClick={() => setScope(key)}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={loading} onClick={() => { void load(scope) }}>
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
          {txa('Yenile')}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        {scope === 'pending'
          ? txa('Yayındaki seri ve bölümlerin onay bekleyen değişiklikleri. Karar verilene kadar okuyucu mevcut sürümü görür.')
          : txa('Onaylanan değişikliklerde yayından kalkan önceki sürümler. Sayfalar silinmez; yalnız site yöneticisi geri alabilir.')}
      </p>
      {error ? <p className="m-0 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && revisions.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {scope === 'pending' ? txa('Bekleyen revizyon yok.') : txa('Arşivde kayıt yok.')}
        </p>
      ) : null}
      <div className="space-y-2">
        {revisions.map((revision) => (
          <RevisionCard
            key={revision.id}
            revision={revision}
            scope={scope}
            busy={busyId === revision.id}
            onApprove={() => { void run(revision, 'approve') }}
            onReject={() => { void run(revision, 'reject') }}
            onRestore={() => { void run(revision, 'restore') }}
          />
        ))}
      </div>
    </section>
  )
}
