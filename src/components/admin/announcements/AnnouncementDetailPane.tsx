import type { ReactNode } from 'react'
import { Archive, BarChart3, FileEdit, Loader2, MoreHorizontal, Pin, Send, Trash2, Undo2 } from 'lucide-react'
import { AnnouncementActions } from '@/components/announcements/AnnouncementActions'
import { AnnouncementContent } from '@/components/announcements/AnnouncementContent'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { audienceLabels, kindLabels, type AdminAnnouncementV2 } from '@/services/announcementV2'
import { KIND_ICON, PRIORITY_LABEL, STATE_META, announcementStateOf, formatAnnouncementDate } from './announcementAdminUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type AnnouncementTransition = 'draft' | 'published' | 'archived' | 'restore'

function Fact({ label, children }: { label: string, children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[12.5px] text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function Metric({ value, label, accent = false }: { value: number, label: string, accent?: boolean }) {
  return (
    <span className={cn('rounded-lg bg-muted/50 px-2.5 py-1', accent && 'bg-primary/10')}>
      <b className={cn('font-bold tabular-nums', accent ? 'text-primary' : 'text-foreground')}>{value.toLocaleString(intlLocale())}</b> {label}
    </span>
  )
}

/**
 * Announcement details (the desk's right panel / drawer on narrow screens): status, target
 * audience and time, measured engagement, preview as the reader sees it and
 * publish settings. Editing is in the large editor window; publish status changes
 * and trash are in the "..." menu.
 */
export function AnnouncementDetailPane({
  item,
  layout,
  busy,
  onEdit,
  onReport,
  onTransition,
  onRequestDelete,
}: {
  item: AdminAnnouncementV2
  /** desk: kararlar basligin saginda; sheet: altta sabit. */
  layout: 'desk' | 'sheet'
  busy: boolean
  onEdit: () => void
  onReport: () => void
  onTransition: (action: AnnouncementTransition) => void
  onRequestDelete: () => void
}) {
  const state = announcementStateOf(item)
  const Icon = KIND_ICON[item.kind]
  const size = layout === 'desk' ? 'sm' : 'default'
  const deleted = state === 'deleted'
  const replies = item.responseCount || item.accepted + item.declined
  const action = item.action

  const primary = deleted ? (
    <Button size={size} variant="outline" disabled={busy} onClick={() => onTransition('restore')} className="gap-1.5" data-testid="admin-announcements-restore">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}{txa('Geri al')}
    </Button>
  ) : (
    <Button size={size} variant="outline" disabled={busy} onClick={onEdit} className="gap-1.5" data-testid="admin-announcements-edit">
      <FileEdit className="size-4" />{txa('Düzenle')}
    </Button>
  )

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Duyuru ayrıntısı')}
      data-testid="admin-announcements-detail"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className={cn('rounded-md px-1.5 py-px text-[10.5px] font-bold', STATE_META[state].pill)}>{STATE_META[state].label}</span>
            <span>{kindLabels[item.kind]}</span>
            {item.priority > 0 ? <span className="inline-flex items-center gap-0.5"><Pin className="size-3" />{PRIORITY_LABEL(item.priority)}</span> : null}
          </span>
          <h2 className="mt-1 line-clamp-2 break-words text-[17px] font-bold leading-snug tracking-tight [overflow-wrap:anywhere]">{item.title}</h2>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {audienceLabels[item.audience]}{item.audience === 'selected' ? txa(' · {v1} kişi', { v1: item.recipients.length }) : ''}
            {' · '}{formatAnnouncementDate(item.starts_at)}{item.ends_at ? ` → ${formatAnnouncementDate(item.ends_at)}` : ''}
          </span>
        </span>
        <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
          {layout === 'desk' ? primary : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" disabled={busy} aria-label={txa('Duyuru işlemleri')} data-testid="admin-announcements-more"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onReport}><BarChart3 className="size-4" />{txa('Etkileşim raporu')}</DropdownMenuItem>
              {!deleted ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={item.status === 'published'} onSelect={() => onTransition('published')}><Send className="size-4" />{txa('Yayımla / planla')}</DropdownMenuItem>
                  <DropdownMenuItem disabled={item.status === 'draft'} onSelect={() => onTransition('draft')}><FileEdit className="size-4" />{txa('Taslağa al')}</DropdownMenuItem>
                  <DropdownMenuItem disabled={item.status === 'archived'} onSelect={() => onTransition('archived')}><Archive className="size-4" />{txa('Arşivle')}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onRequestDelete} data-testid="admin-announcements-delete"><Trash2 className="size-4" />{txa('Çöp kutusuna taşı…')}</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section>
          <h3 className="mb-2 flex items-center justify-between gap-3 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
            {txa('Etkileşim')}
            <button type="button" onClick={onReport} className="text-[11.5px] font-semibold normal-case tracking-normal text-primary hover:underline">{txa('Ayrıntılı rapor')}</button>
          </h3>
          <div className="flex flex-wrap gap-1.5 text-[12px] text-muted-foreground" data-testid="admin-announcements-metrics">
            <Metric value={item.clicks} label={txa('tık')} />
            <Metric value={item.views} label={txa('hesap açtı')} />
            {item.linkClicks ? <Metric value={item.linkClicks} label={txa('bağlantı tıklaması')} /> : null}
            {item.kind === 'reward' ? <Metric value={item.claims} label={txa('ödül alındı')} accent /> : null}
            {item.kind === 'invitation' ? <Metric value={replies} label={txa('yanıt')} accent /> : null}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Okuyucunun gördüğü')}</h3>
          <div className="rounded-2xl border border-border/70 bg-card p-5" data-testid="admin-announcements-preview">
            <p className="mb-2 text-xs font-bold text-primary">{kindLabels[item.kind]}</p>
            <h4 className="mb-4 break-words text-lg font-bold">{item.title}</h4>
            <AnnouncementContent announcement={item.preview} preview />
            <AnnouncementActions announcement={item.preview} preview />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Yayın ayarları')}</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact label={txa('Hedef kitle')}>{audienceLabels[item.audience]}{item.audience === 'selected' ? ` (${item.recipients.length})` : ''}</Fact>
            <Fact label={txa('Başlangıç')}>{formatAnnouncementDate(item.starts_at)}</Fact>
            <Fact label={txa('Bitiş')}>{item.ends_at ? formatAnnouncementDate(item.ends_at) : txa('Süresiz')}</Fact>
            <Fact label={txa('Öncelik')}>{PRIORITY_LABEL(item.priority)}</Fact>
            <Fact label={txa('Ana sayfada')}>{item.show_home ? txa('Gösterilir') : txa('Gösterilmez')}</Fact>
            {action.type === 'link' ? <Fact label={txa('Bağlantı')}>{action.label} → {action.url}{action.direct ? txa(' (kart doğrudan açar)') : ''}</Fact> : null}
            {action.type === 'reward' ? <Fact label={txa('Ödül')}>{txa('{v1} coin × {v2} kişi', { v1: action.value.toLocaleString(intlLocale()), v2: action.maxClaims.toLocaleString(intlLocale()) })}{action.conditions?.length ? txa(' · {v1} koşul', { v1: action.conditions.length }) : ''}</Fact> : null}
            <Fact label={txa('Sürüm')}>{item.revision} · {formatAnnouncementDate(item.updated_at)}</Fact>
          </dl>
          {item.audience === 'selected' && item.recipients.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.recipients.map((recipient) => <span key={recipient.id} className="rounded-full bg-muted/70 px-2 py-0.5 text-[12px]">{recipient.title}</span>)}
            </div>
          ) : null}
        </section>
      </div>

      {layout === 'sheet' ? (
        <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-card/80 px-5 py-3">{primary}</footer>
      ) : null}
    </section>
  )
}
