import { useEffect, useState } from 'react'
import { Ban, Loader2 } from 'lucide-react'
import type { AdminManagedUser } from '@/services/adminUserService'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toDatetimeLocalValue } from './adminUsersUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminUserBanDialogProps {
  users: AdminManagedUser[]
  isOpen: boolean
  banReason: string
  banUntil: string
  isBusy: boolean
  onClose: () => void
  onBanReasonChange: (value: string) => void
  onBanUntilChange: (value: string) => void
  onConfirm: () => Promise<void>
}

type BanDuration = '1d' | '7d' | '30d' | 'permanent' | 'custom'

const DURATIONS: Array<{ id: BanDuration, label: string, days?: number }> = [
  { id: '1d', get label() { return txa('1 gün') }, days: 1 },
  { id: '7d', get label() { return txa('7 gün') }, days: 7 },
  { id: '30d', get label() { return txa('30 gün') }, days: 30 },
  { id: 'permanent', get label() { return txa('Kalıcı') } },
  { id: 'custom', get label() { return txa('Tarih seç') } },
]

/**
 * Ban dialog: reason required (written to the audit record), duration from
 * presets or a date. A permanent ban only when explicitly chosen.
 */
export function AdminUserBanDialog({
  users,
  isOpen,
  banReason,
  banUntil,
  isBusy,
  onClose,
  onBanReasonChange,
  onBanUntilChange,
  onConfirm,
}: AdminUserBanDialogProps) {
  const activeUsers = users.filter((user) => !user.isBanned)
  const isBulk = activeUsers.length > 1
  const [duration, setDuration] = useState<BanDuration>('7d')

  useEffect(() => {
    if (!isOpen) return
    setDuration('7d')
    onBanUntilChange(toDatetimeLocalValue(new Date(Date.now() + 7 * 86_400_000).toISOString()))
    // Pencere her acilista varsayilan 7 gune doner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const pickDuration = (next: (typeof DURATIONS)[number]) => {
    setDuration(next.id)
    if (next.days) onBanUntilChange(toDatetimeLocalValue(new Date(Date.now() + next.days * 86_400_000).toISOString()))
    else if (next.id === 'permanent') onBanUntilChange('')
  }

  const customInvalid = duration === 'custom' && (!banUntil || new Date(banUntil).getTime() <= Date.now())
  const reasonValid = banReason.trim().length >= 3

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isBusy) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="admin-user-ban-dialog">
        <DialogHeader>
          <DialogTitle>{isBulk ? txa('{v1} kullanıcıyı banla', { v1: activeUsers.length }) : txa('Kullanıcıyı banla')}</DialogTitle>
          <DialogDescription>
            {activeUsers.slice(0, 4).map((user) => `@${user.username}`).join(', ')}
            {activeUsers.length > 4 ? txa(' ve {v1} kullanıcı daha', { v1: activeUsers.length - 4 }) : ''}
          </DialogDescription>
        </DialogHeader>

        {activeUsers.length > 0 ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-xl bg-rose-500/[0.07] px-3.5 py-2.5 text-[12.5px] leading-5 text-rose-800 dark:text-rose-200">
              {txa('Neden denetim kaydına yazılır; ban sürdükçe hesabın güven skoru 0\'a sabitlenir ve sonrasında ban geçmişi olarak hesaba katılır.')}
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-ban-reason">{txa('Neden')}</Label>
              <Textarea
                id="admin-ban-reason"
                value={banReason}
                onChange={(event) => onBanReasonChange(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder={txa('Hangi kural çiğnendi, ne oldu?')}
                autoFocus
                data-testid="admin-user-ban-reason"
              />
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>{reasonValid ? '' : txa('En az 3 karakter')}</span>
                <span className="tabular-nums">{banReason.length}/500</span>
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{txa('Süre')}</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={txa('Ban süresi')}>
                {DURATIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={duration === option.id}
                    onClick={() => pickDuration(option)}
                    data-testid={`admin-user-ban-duration-${option.id}`}
                    className={cn(
                      'h-8 rounded-full border px-3 text-[12.5px] font-semibold transition-colors',
                      duration === option.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {duration === 'custom' ? (
                <Input
                  type="datetime-local"
                  aria-label={txa('Ban bitiş tarihi')}
                  className="h-9"
                  value={banUntil}
                  min={toDatetimeLocalValue(new Date().toISOString())}
                  onChange={(event) => onBanUntilChange(event.target.value)}
                />
              ) : null}
              <span className="text-[11.5px] text-muted-foreground">
                {duration === 'permanent'
                  ? txa('Ban, elle kaldırılana kadar sürer.')
                  : banUntil && !customInvalid
                    ? txa('{v1} tarihinde kendiliğinden kalkar.', { v1: new Date(banUntil).toLocaleString(intlLocale(), { dateStyle: 'long', timeStyle: 'short' }) })
                    : txa('Gelecekte bir tarih seç.')}
              </span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>{txa('Vazgeç')}</Button>
              <Button
                type="button"
                variant="destructive"
                className="gap-1.5"
                onClick={() => void onConfirm()}
                disabled={isBusy || !reasonValid || customInvalid}
                data-testid="admin-user-ban-confirm"
              >
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                {isBulk ? txa('{v1} kullanıcıyı banla', { v1: activeUsers.length }) : txa('Banla')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {txa('Ban uygulanabilecek etkin bir kullanıcı seçilmedi.')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
