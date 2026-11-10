import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Archive, ArchiveRestore, Ban, Check, Clock3, Loader2, Trash2, UserMinus, UserCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { CommunityAdminReport, CommunityMemberOperation } from '@/services/communityAdminService'
import { TIMEOUT_PRESETS, formatMinutes } from './communityAdminUtils'
import { txa } from '@/i18n/activeLocale'

function Shell({ open, busy, testId, title, description, onCancel, children, footer }: {
  open: boolean
  busy: boolean
  testId: string
  title: string
  description: string
  onCancel: () => void
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] gap-0 p-0 sm:max-w-[500px]" data-testid={testId}>
        <DialogHeader className="px-6 pb-3 pt-5 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 pb-5 text-[12.5px]">{children}</div>
        <DialogFooter className="gap-2 border-t border-border/60 px-6 py-3">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Consequence({ tone = 'muted', children }: { tone?: 'muted' | 'rose', children: ReactNode }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl px-3.5 py-2.5', tone === 'rose' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-muted/60 text-muted-foreground')}>
      {tone === 'rose' ? <AlertTriangle className="mt-px size-4 shrink-0" /> : null}
      <span>{children}</span>
    </p>
  )
}

export interface MemberActionTarget {
  serverId: string
  serverName: string
  userId: string
  username: string
  operation: CommunityMemberOperation
  /** Kisitlama suruyorsa "kaldir" secenegi gosterilir. */
  timedOut?: boolean
}

const MEMBER_COPY: Record<CommunityMemberOperation, { title: string, confirm: string, icon: typeof Ban, destructive: boolean }> = {
  timeout: { get title() { return txa('Yazmayı süreli kısıtla') }, get confirm() { return txa('Kısıtla') }, icon: Clock3, destructive: false },
  kick: { get title() { return txa('Sunucudan çıkar') }, get confirm() { return txa('Çıkar') }, icon: UserMinus, destructive: true },
  ban: { get title() { return txa('Sunucudan yasakla') }, get confirm() { return txa('Yasakla') }, icon: Ban, destructive: true },
  unban: { get title() { return txa('Yasağı kaldır') }, get confirm() { return txa('Yasağı kaldır') }, icon: UserCheck, destructive: false },
}

/**
 * A site admin's member action. The result is the same as in-server management; no notification
 * goes out, and it is written to the action history as site admin.
 */
export function MemberActionDialog({ target, busy, onCancel, onConfirm }: {
  target: MemberActionTarget | null
  busy: boolean
  onCancel: () => void
  onConfirm: (minutes?: number) => void
}) {
  const [minutes, setMinutes] = useState(60)
  useEffect(() => { setMinutes(60) }, [target?.userId, target?.operation])
  if (!target) return null
  const copy = MEMBER_COPY[target.operation]
  const Icon = copy.icon
  const who = `@${target.username}`
  const text = {
    timeout: txa('{v1}, {v2} sunucusunda seçtiğin süre boyunca mesaj yazamaz ve tepki veremez; okumaya devam eder.', { v1: who, v2: target.serverName }),
    kick: txa('{v1}, {v2} sunucusundan çıkarılır ve rolleri silinir. İsterse yeniden katılabilir.', { v1: who, v2: target.serverName }),
    ban: txa('{v1}, {v2} sunucusundan çıkarılır, rolleri silinir ve yeniden katılamaz.', { v1: who, v2: target.serverName }),
    unban: txa('{v1} yeniden katılabilir hâle gelir; eski rolleri geri gelmez.', { v1: who }),
  }[target.operation]

  return (
    <Shell
      open
      busy={busy}
      testId="admin-community-member-dialog"
      title={copy.title}
      description={`${who} · ${target.serverName}`}
      onCancel={onCancel}
      footer={(
        <>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>{txa('Vazgeç')}</Button>
          <Button variant={copy.destructive ? 'destructive' : 'default'} disabled={busy} onClick={() => onConfirm(target.operation === 'timeout' ? minutes : undefined)} data-testid="admin-community-member-confirm">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            {target.operation === 'timeout' && minutes === 0 ? txa('Kısıtlamayı kaldır') : copy.confirm}
          </Button>
        </>
      )}
    >
      <Consequence tone={copy.destructive ? 'rose' : 'muted'}>{txa('{v1} Kişiye bildirim gitmez; sunucunun işlem geçmişine site yöneticisi olarak yazılır.', { v1: text })}</Consequence>
      {target.operation === 'timeout' ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={txa('Süre')}>
          {TIMEOUT_PRESETS.map((preset) => (
            <button
              key={preset.minutes}
              type="button"
              aria-pressed={minutes === preset.minutes}
              onClick={() => setMinutes(preset.minutes)}
              className={cn('rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors', minutes === preset.minutes ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {preset.label}
            </button>
          ))}
          {target.timedOut ? (
            <button
              type="button"
              aria-pressed={minutes === 0}
              onClick={() => setMinutes(0)}
              className={cn('rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors', minutes === 0 ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {txa('Kısıtlamayı kaldır')}
            </button>
          ) : null}
        </div>
      ) : null}
      {target.operation === 'timeout' && minutes > 0 ? <p className="text-muted-foreground">{txa('Süre: {v1}', { v1: formatMinutes(minutes) })}</p> : null}
    </Shell>
  )
}

/** Server archive: messaging and joining stop, history is kept; it can be undone. */
export function ArchiveDialog({ server, busy, onCancel, onConfirm }: {
  server: { name: string, archived: boolean } | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!server) return null
  const archiving = !server.archived
  return (
    <Shell
      open
      busy={busy}
      testId="admin-community-archive-dialog"
      title={archiving ? txa('Sunucuyu arşivle') : txa('Sunucuyu arşivden çıkar')}
      description={server.name}
      onCancel={onCancel}
      footer={(
        <>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>{txa('Vazgeç')}</Button>
          <Button variant={archiving ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm} data-testid="admin-community-archive-confirm">
            {busy ? <Loader2 className="size-4 animate-spin" /> : archiving ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
            {archiving ? txa('Arşivle') : txa('Arşivden çıkar')}
          </Button>
        </>
      )}
    >
      <Consequence tone={archiving ? 'rose' : 'muted'}>
        {archiving
          ? txa('Sunucuda yeni mesaj yazılamaz, tepki verilemez ve yeni üye katılamaz. Mesaj geçmişi ve üyeler korunur; istediğinde arşivden çıkarabilirsin.')
          : txa('Sunucu yeniden yazışmaya ve katılıma açılır.')}
        {' '}{txa('İşlem, sunucunun geçmişine site yöneticisi olarak yazılır.')}
      </Consequence>
    </Shell>
  )
}

export type ReportDecisionMode = 'delete' | 'resolve' | 'dismiss'

const DECISION_COPY: Record<ReportDecisionMode, { title: string, confirm: string, text: string, destructive: boolean }> = {
  delete: {
    get title() { return txa('Mesajı kaldır ve şikâyeti sonuçlandır') },
    get confirm() { return txa('Mesajı kaldır') },
    get text() { return txa('Mesajın metni silinir ve sohbette "Bu mesaj silindi" görünür; tepkileri kaldırılır. Şikâyet sonuçlandırılmış olarak kapanır. Yazara bildirim gitmez.') },
    destructive: true,
  },
  resolve: {
    get title() { return txa('Şikâyeti sonuçlandır') },
    get confirm() { return txa('Sonuçlandır') },
    get text() { return txa('Mesaj olduğu gibi kalır; şikâyet sonuçlandırılmış olarak kapanır (örneğin sunucu yetkilisi zaten ilgilendiyse).') },
    destructive: false,
  },
  dismiss: {
    get title() { return txa('Şikâyeti gerekçesiz bul') },
    get confirm() { return txa('Gerekçesiz bul') },
    get text() { return txa('Mesaj olduğu gibi kalır; şikâyet gerekçesiz bulunarak kapanır.') },
    destructive: false,
  },
}

/** Report decision; the note is a review note seen only by admins. */
export function ReportDecisionDialog({ report, mode, busy, onCancel, onConfirm }: {
  report: CommunityAdminReport | null
  mode: ReportDecisionMode
  busy: boolean
  onCancel: () => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')
  useEffect(() => { setNote('') }, [report?.id, mode])
  if (!report) return null
  const copy = DECISION_COPY[mode]
  return (
    <Shell
      open
      busy={busy}
      testId="admin-community-report-dialog"
      title={copy.title}
      description={`@${report.message.author.username ?? txa('üye')}: ${report.message.body || txa('Metin yok')}`}
      onCancel={onCancel}
      footer={(
        <>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>{txa('Vazgeç')}</Button>
          <Button variant={copy.destructive ? 'destructive' : 'default'} disabled={busy} onClick={() => onConfirm(note.trim())} data-testid="admin-community-report-confirm">
            {busy ? <Loader2 className="size-4 animate-spin" /> : mode === 'delete' ? <Trash2 className="size-4" /> : mode === 'resolve' ? <Check className="size-4" /> : <X className="size-4" />}
            {copy.confirm}
          </Button>
        </>
      )}
    >
      <Consequence tone={copy.destructive ? 'rose' : 'muted'}>{copy.text}</Consequence>
      <label className="block">
        <span className="mb-1.5 flex items-center justify-between text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
          {txa('İnceleme notu (isteğe bağlı)')}
          <span className="font-medium normal-case tracking-normal tabular-nums">{note.length}/1000</span>
        </span>
        <Textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 1000))} rows={2} placeholder={txa('Yalnız yöneticiler görür.')} className="resize-none text-[13px]" />
      </label>
    </Shell>
  )
}
