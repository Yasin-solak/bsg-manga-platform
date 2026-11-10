import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  AlertTriangle, BookOpen, Check, CircleSlash, ClipboardCheck, ExternalLink, EyeOff, Loader2, MessagesSquare, MoreHorizontal,
  PencilLine, RotateCcw,
} from 'lucide-react'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import type { AdminMangaControlItem } from '@/services/adminService'
import type { MangaDetailTab } from '../manga-control/MangaDetailControlModal'
import { SERIES_TYPE_LABEL, STATUS_OPTIONS, mangaMissingMeta, mangaRelativeAge, statusText } from './mangaManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function MangaCover({ manga, large = false }: { manga: Pick<AdminMangaControlItem, 'coverImageUrl' | 'title'>, large?: boolean }) {
  const box = large ? 'h-24 w-16 rounded-lg' : 'h-14 w-10 rounded-md'
  return manga.coverImageUrl
    ? <img src={manga.coverImageUrl} alt="" loading="lazy" decoding="async" className={cn(box, 'shrink-0 border border-border bg-muted object-cover')} />
    : <span className={cn(box, 'flex shrink-0 items-center justify-center border border-dashed border-border bg-muted/50 text-muted-foreground')} aria-label={txa('Kapak yok')}><BookOpen className="size-4" /></span>
}

export function MangaTag({ tone, children }: { tone?: 'rose' | 'amber' | 'sky' | 'violet', children: ReactNode }) {
  return (
    <span className={cn(
      'rounded-md px-1.5 py-px text-[10.5px] font-bold',
      tone === 'rose' ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
        : tone === 'amber' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
          : tone === 'sky' ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
            : tone === 'violet' ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
              : 'bg-muted text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function Stat({ label, value, tone }: { label: string, value: ReactNode, tone?: 'amber' }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-[15px] font-bold tabular-nums', tone === 'amber' && 'text-amber-600 dark:text-amber-300')}>{value}</dd>
    </div>
  )
}

/**
 * Selected series (the desk's right panel / drawer on narrow screens). Approval, publishing and status
 * are here; chapter review, details editing and comment / rating moderation
 * open in a detail management window.
 *
 * "No fansub" is NOT A WARNING: manga is a shared catalog with no ownership; the team
 * that opened the record is only a trace.
 */
export function MangaDetailPane({ manga, layout, busy, onApprove, onUnapprove, onSetActive, onStatusChange, onOpenManage }: {
  manga: AdminMangaControlItem
  layout: 'desk' | 'sheet'
  busy: boolean
  onApprove: () => void
  onUnapprove: () => void
  onSetActive: (active: boolean) => void
  onStatusChange: (status: 'ongoing' | 'completed' | 'hiatus') => void
  onOpenManage: (tab: MangaDetailTab) => void
}) {
  const missing = mangaMissingMeta(manga)
  const pendingChapters = manga.chapterStats.pending
  const size = layout === 'desk' ? 'sm' : 'default'
  const primary = !manga.isApproved ? (
    <Button size={size} disabled={busy} onClick={onApprove} className="gap-1.5" data-testid="admin-manga-approve">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{txa('Onayla')}
    </Button>
  ) : !manga.isActive ? (
    <Button size={size} variant="outline" disabled={busy} onClick={() => onSetActive(true)} className="gap-1.5" data-testid="admin-manga-activate">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{txa('Yayına al')}
    </Button>
  ) : (
    <Button size={size} variant="outline" disabled={busy} onClick={() => onOpenManage('chapters')} className="gap-1.5" data-testid="admin-manga-review-chapters">
      <ClipboardCheck className="size-4" />{txa('Bölümleri incele')}
    </Button>
  )

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Seri ayrıntısı')}
      data-testid="admin-manga-detail"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <MangaCover manga={manga} large />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {!manga.isApproved ? <MangaTag tone="amber">{txa('Onay bekliyor')}</MangaTag> : null}
            {!manga.isActive ? <MangaTag tone="rose">{txa('Yayında değil')}</MangaTag> : null}
            {manga.isMature ? <MangaTag tone="rose">18+</MangaTag> : null}
            <MangaTag tone="sky">{SERIES_TYPE_LABEL[manga.seriesType] ?? manga.seriesType}</MangaTag>
            <span className="text-[11.5px] text-muted-foreground">{statusText(manga.status)}</span>
          </span>
          <h2 className="mt-1 line-clamp-2 break-words text-[17px] font-bold tracking-tight [overflow-wrap:anywhere]">{manga.title}</h2>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {/* Sahiplik degil: katalog kaydini acan ekip. */}
            {manga.fansubId ? <>{txa('Kaydı açan')} <AdminEntityHoverCard kind="fansub" entityKey={manga.fansubId}>{manga.fansubName}</AdminEntityHoverCard> · </> : null}
            {txa('güncellendi')} {mangaRelativeAge(manga.updatedAt)}
          </span>
        </span>
        <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
          {layout === 'desk' ? primary : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={txa('Diğer işlemler')} data-testid="admin-manga-more"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Sitede aç')}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenManage('meta')}><PencilLine className="size-4" />{txa('Künyeyi düzenle')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenManage('community')}><MessagesSquare className="size-4" />{txa('Yorum ve puanlar')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {manga.isApproved ? <DropdownMenuItem onSelect={onUnapprove} data-testid="admin-manga-unapprove"><RotateCcw className="size-4" />{txa('Onayı geri al…')}</DropdownMenuItem> : null}
              {manga.isActive
                ? <DropdownMenuItem variant="destructive" onSelect={() => onSetActive(false)} data-testid="admin-manga-deactivate"><EyeOff className="size-4" />{txa('Yayından kaldır…')}</DropdownMenuItem>
                : <DropdownMenuItem onSelect={() => onSetActive(true)}><RotateCcw className="size-4" />{txa('Yayına al')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {pendingChapters > 0 || manga.chapterStats.total === 0 || missing.length > 0 ? (
          <ul className="flex flex-col gap-1.5" data-testid="admin-manga-warnings">
            {pendingChapters > 0 ? (
              <li className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
                <ClipboardCheck className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">{txa('{v1} bölüm kriter incelemesi bekliyor.', { v1: pendingChapters })}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => onOpenManage('chapters')}>{txa('İncele')}</Button>
              </li>
            ) : null}
            {manga.chapterStats.total === 0 ? (
              <li className="flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-2 text-[12.5px] text-muted-foreground"><CircleSlash className="size-4 shrink-0" />{txa('Hiç bölümü yok; okuyucu için çıkmaz sokak.')}</li>
            ) : null}
            {missing.length > 0 ? (
              <li className="flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-2 text-[12.5px] text-muted-foreground">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">{txa('Künye eksik: {v1}.', { v1: missing.join(', ') })}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => onOpenManage('meta')}>{txa('Tamamla')}</Button>
              </li>
            ) : null}
          </ul>
        ) : null}

        <dl className="grid grid-cols-3 divide-x divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 [&>*:nth-child(-n+3)]:border-t-0" data-testid="admin-manga-stats">
          <Stat label={txa('Bölüm')} value={manga.chapterStats.total.toLocaleString(intlLocale())} />
          <Stat label={txa('İncelemede')} value={pendingChapters.toLocaleString(intlLocale())} tone={pendingChapters > 0 ? 'amber' : undefined} />
          <Stat label={txa('Son bölüm')} value={manga.lastChapterNumber == null ? '—' : manga.lastChapterNumber.toLocaleString(intlLocale())} />
          <Stat label={txa('Görüntülenme')} value={manga.totalViews.toLocaleString(intlLocale())} />
          <Stat label={txa('Takipçi')} value={manga.followerCount.toLocaleString(intlLocale())} />
          <Stat label={txa('Puan')} value={manga.rating == null || manga.totalRatings === 0 ? '—' : `${manga.rating.toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} · ${manga.totalRatings}`} />
        </dl>

        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Künye')}</h3>
          {manga.description?.trim()
            ? <p className="line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-6 [overflow-wrap:anywhere]">{manga.description}</p>
            : <p className="text-[12.5px] italic text-muted-foreground">{txa('Açıklama yok.')}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {manga.genres.length ? manga.genres.map((genre) => <MangaTag key={genre}>{genre}</MangaTag>) : <span className="text-[12px] text-muted-foreground">{txa('Tür seçilmemiş.')}</span>}
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-3">
          <label className="text-[12.5px] font-semibold" htmlFor={`manga-status-${manga.id}`}>{txa('Yayın durumu')}</label>
          <Select value={manga.status ?? undefined} onValueChange={(value) => onStatusChange(value as 'ongoing' | 'completed' | 'hiatus')} disabled={busy}>
            <SelectTrigger id={`manga-status-${manga.id}`} className="h-8 w-auto min-w-[150px] text-[12.5px]" data-testid="admin-manga-status"><SelectValue placeholder={txa('Seç')} /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-[11.5px] text-muted-foreground">{txa('Eklendi {v1}', { v1: mangaRelativeAge(manga.createdAt) })}</span>
        </section>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-card/80 px-5 py-3">
        {layout === 'sheet' ? primary : null}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onOpenManage('chapters')} data-testid="admin-manga-open-manage"><BookOpen className="size-4" />{txa('Ayrıntılı yönetim')}</Button>
      </footer>
    </section>
  )
}
