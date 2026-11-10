import { BookOpen, CheckCircle2, Mail, ShieldCheck, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  formatListValue,
  getAgeRatingLabel,
  getDraftCompletion,
  getExperienceLabel,
  splitCsv,
  type FansubRequestDraft,
} from './fansubRequestModal.shared'
import { txa } from '@/i18n/activeLocale'

interface FansubRequestPreviewProps {
  draft: FansubRequestDraft
  avatarPreviewUrl: string | null
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'FS'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function PreviewRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex gap-2 rounded-md border border-border/60 bg-background/70 p-2.5">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-xs leading-snug text-foreground">{value || '-'}</p>
      </div>
    </div>
  )
}

export function FansubRequestPreview({ draft, avatarPreviewUrl }: FansubRequestPreviewProps) {
  const completion = getDraftCompletion(draft)
  const focusGenres = splitCsv(draft.focusGenresInput)
  const contact = draft.contactEmail || draft.contactDiscord || '-'

  return (
    <aside className="hidden min-h-0 flex-col border-l border-border/60 bg-card/20 lg:flex">
      <div className="border-b border-border/60 px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{txa('Canlı Önizleme')}</p>
        <h3 className="mt-1 text-sm font-semibold text-foreground">{txa('Adminin göreceği başvuru özeti')}</h3>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-5 py-4">
        <div className="rounded-md border border-border bg-background p-4">
          <div className="flex items-center gap-3">
            {avatarPreviewUrl ? (
              <img
                src={avatarPreviewUrl}
                alt={txa('Fansub avatar önizleme')}
                className="h-16 w-16 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-full border border-border bg-muted text-lg font-bold text-muted-foreground">
                {initialsFromName(draft.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-foreground">{draft.name.trim() || txa('Fansub adı')}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
                {draft.description.trim() || txa('Kısa açıklama burada görünecek.')}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(focusGenres.length > 0 ? focusGenres.slice(0, 4) : [txa('Tür seçilmedi')]).map((genre) => (
              <span
                key={genre}
                className={cn(
                  'rounded-full border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground',
                  focusGenres.length > 0 && 'bg-primary/10 text-primary',
                )}
              >
                {genre}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-foreground">{txa('Başvuru doluluğu')}</span>
            <span className="text-xs font-bold text-primary">{txa('%{v1}', { v1: completion })}</span>
          </div>
          <Progress value={completion} className="h-1.5" />
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {txa('Eksik alanlar admin kararini yavaslatir; zorunlu alanlar tamamlanmadan gonderim acilmaz.')}
          </p>
        </div>

        <div className="grid gap-2">
          <PreviewRow
            icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
            label={txa('Yayın planı')}
            value={txa('{v1} bölüm / hafta - {v2}', { v1: draft.weeklyReleaseGoal || '-', v2: formatListValue(draft.contentTypes) })}
          />
          <PreviewRow
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
            label={txa('Ekip')}
            value={txa('{v1} kişi - {v2}', { v1: draft.teamSize || '-', v2: getExperienceLabel(draft.experienceLevel) })}
          />
          <PreviewRow
            icon={<Mail className="h-4 w-4" aria-hidden="true" />}
            label={txa('İletişim')}
            value={contact}
          />
          <PreviewRow
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            label={txa('Kurallar')}
            value={`${getAgeRatingLabel(draft.ageRatingPolicy)} - ${draft.dmcaAccepted ? txa('DMCA kabul edildi') : txa('DMCA bekliyor')}`}
          />
        </div>

        {draft.dmcaAccepted ? (
          <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-xs text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{txa('Başvuru gönderime hazır. Kayıt admin onayına düşmeden fansub oluşturulmaz.')}</span>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
