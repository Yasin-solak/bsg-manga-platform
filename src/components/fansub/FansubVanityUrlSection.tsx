import { Link2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { BoostLinkState } from './FansubEditLockStates'
import {
  buildFansubVanityUrlLockedMessage,
  formatFansubVanityUrlGovernanceDate,
  resolveFansubVanityUrlGovernance,
} from '@/lib/fansubVanityUrl'
import { FANSUB_VANITY_URL_COOLDOWN_DAYS } from '@/services/fansubService'
import { txa } from '@/i18n/activeLocale'

interface FansubVanityUrlSectionProps {
  disabled: boolean
  hasAccess: boolean
  lastChangedAt?: string
  onChange: (value: string) => void
  onOpenBoost?: () => void
  value: string
}

export default function FansubVanityUrlSection({
  disabled,
  hasAccess,
  lastChangedAt,
  onChange,
  onOpenBoost,
  value,
}: FansubVanityUrlSectionProps) {
  if (!hasAccess) {
    return (
      <div data-testid="fansub-vanity-url-section" data-vanity-lock-mode="locked">
        <BoostLinkState
          onOpenBoost={onOpenBoost}
          text={txa('Fansub icin ozel ve hatirlanabilir bir adres olusturabilirsiniz. Bu alan icin Seviye 3 takviye gerekir.')}
        />
      </div>
    )
  }

  const normalizedValue = value.trim().toLowerCase()
  const previewPath = `/fansub/${normalizedValue || 'ornek-ekip'}`
  const governance = resolveFansubVanityUrlGovernance(lastChangedAt)
  const lastChangedDateLabel = formatFansubVanityUrlGovernanceDate(governance.lastChangedAt)
  const nextChangeDateLabel = formatFansubVanityUrlGovernanceDate(governance.cooldownEndsAt)
  const isInputLocked = disabled || !governance.canChange

  return (
    <div
      data-testid="fansub-vanity-url-section"
      data-vanity-lock-mode={isInputLocked ? 'cooldown' : 'editable'}
      className='rounded-2xl border border-border/70 bg-background/70 p-4'
    >
      <div className='flex items-start gap-3'>
        <span className='mt-0.5 inline-flex size-9 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground'>
          <Link2 className='size-4' />
        </span>
        <div className='min-w-0 flex-1 space-y-2'>
          <div className='space-y-1'>
            <p className='text-sm font-semibold text-foreground'>{txa('Ozel URL')}</p>
            <p className='text-xs leading-5 text-muted-foreground'>{txa('Public fansub adresi olarak kullanilir. Bu alan anlik degismez; linklerin kirilmamasi icin kuralli ve yavas ilerler.')}</p>
          </div>

          <div className='flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground'>
            <span className='inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1'>
              {txa('{v1} gunde 1 degisim', { v1: FANSUB_VANITY_URL_COOLDOWN_DAYS })}
            </span>
            <span className='inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1'>
              {txa('Yalnizca kucuk harf, rakam ve tire')}
            </span>
            {lastChangedDateLabel ? (
              <span className='inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1'>
                {txa('Son degisiklik: {v1}', { v1: lastChangedDateLabel })}
              </span>
            ) : (
              <span className='inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1'>
                {txa('Ilk ozel URL degisikligi acik')}
              </span>
            )}
          </div>

          <div className='flex items-center rounded-xl border border-border/70 bg-background pl-3'>
            <span className='shrink-0 text-xs text-muted-foreground'>/fansub/</span>
            <Input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={txa('ornek-ekip')}
              disabled={isInputLocked}
              autoCapitalize='off'
              autoCorrect='off'
              spellCheck={false}
              className='border-0 bg-transparent shadow-none focus-visible:ring-0'
            />
          </div>

          <div className='space-y-1 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground'>
            <p className='m-0 truncate'>{txa('Public rota: {v1}', { v1: previewPath })}</p>
            {!governance.canChange ? (
              <p className='m-0 leading-5 text-amber-300'>
                {buildFansubVanityUrlLockedMessage(lastChangedAt)}
              </p>
            ) : nextChangeDateLabel ? (
              <p className='m-0 leading-5'>{txa('Kaydedersen sonraki degisim {v1} tarihine kadar kilitlenir.', { v1: nextChangeDateLabel })}</p>
            ) : (
              <p className='m-0 leading-5'>{txa('Ilk degisiklikten sonra cooldown otomatik olarak baslar.')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
