import { useEffect, useRef, useState } from 'react'
import { Lightning, LockSimple, Rocket } from '@phosphor-icons/react'
import { Link } from '@/i18n/router'
import { cn } from '@/lib/utils'
import type { TlStudioStatus } from '@/services/translationStudioService'
import { intlLocale, txa } from '@/i18n/activeLocale'

const TIERS = [1, 2, 3] as const
/** Measured with Haiku 5.5: a 60-page webtoon chapter (scan + translation) is about 70 credits. */
const CREDITS_PER_CHAPTER = 70

const credits = (value: number) => value.toLocaleString(intlLocale())
const chapters = (value: number) => Math.max(0, Math.floor(value / CREDITS_PER_CHAPTER))
const resetDay = (iso: string | null | undefined) => (iso
  ? new Date(iso).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' })
  : '')

/**
 * Header pill: this month's AI credits with a progress bar; the panel explains credits (real API
 * cost), the boost tiers (tier 1 opens the studio, each tier raises the monthly credits) and links
 * to the boost page.
 */
export function StudioLimitBar({ status, boostHref }: { status: TlStudioStatus, boostHref: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey) }
  }, [open])

  const remaining = Math.max(0, status.limit - status.used)
  const ratio = status.unlimited || status.limit <= 0 ? 0 : Math.min(1, status.used / status.limit)
  const tone = status.unlimited ? 'var(--tl-p)' : remaining === 0 ? 'var(--tl-red)' : ratio >= 0.8 ? 'var(--tl-amber)' : 'var(--tl-green)'

  return (
    <div ref={rootRef} className='relative flex-none' data-testid='tl-limit-bar'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className='flex h-8 items-center gap-2.5 rounded-full border border-[var(--tl-line)] bg-[var(--tl-card)] px-3 text-xs font-bold text-[var(--tl-fg2)] hover:border-[var(--tl-p35)]'
        title={txa('Aylık yapay zekâ kredisi')}
      >
        <Lightning weight='fill' size={13} style={{ color: tone }} />
        {status.unlimited ? (
          <span>{txa('Bu ay {v1} kredi · sınırsız', { v1: credits(status.used) })}</span>
        ) : (
          <>
            <span className='tabular-nums'>{txa('{v1} / {v2} kredi', { v1: credits(status.used), v2: credits(status.limit) })}</span>
            <span className='hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--tl-acc2)] sm:block' aria-hidden='true'>
              <span className='block h-full rounded-full transition-[width]' style={{ width: `${ratio * 100}%`, background: tone }} />
            </span>
          </>
        )}
      </button>
      {open && (
        <div className='tl-screen absolute right-0 top-10 z-50 flex w-[310px] flex-col gap-3 rounded-[14px] border border-[var(--tl-line2)] bg-[var(--tl-card)] p-4 shadow-2xl' role='dialog' aria-label={txa('Yapay zekâ kredisi')}>
          <div className='flex flex-col gap-1'>
            <span className='text-[13px] font-extrabold'>{txa('Aylık yapay zekâ kredisi')}</span>
            <span className='text-xs font-semibold leading-relaxed text-[var(--tl-mut)]'>
              {status.unlimited
                ? txa('Site yöneticisi olarak sınırın yok.')
                : txa('Bu ay {v1} kredi kaldı (yaklaşık {v2} bölüm). Kredi {v3} tarihinde yenilenir.', { v1: credits(remaining), v2: chapters(remaining), v3: resetDay(status.resets_at) })}
            </span>
            <span className='text-[11.5px] font-semibold leading-relaxed text-[var(--tl-dim)]'>
              {txa('Her tarama ve çeviri gerçek maliyeti kadar kredi düşer: uzun bir webtoon sayfası yaklaşık 1-2 kredi, 60 sayfalık bir bölüm yaklaşık {v1} kredi.', { v1: CREDITS_PER_CHAPTER })}
            </span>
          </div>
          {status.manual_quota ? (
            <span className='rounded-lg bg-[var(--tl-p15)] px-3 py-2 text-xs font-semibold text-[var(--tl-fg2)]'>{txa('Ekibine özel bir kredi tanımlandı: ayda {v1} kredi.', { v1: credits(status.limit) })}</span>
          ) : (
            <div className='flex flex-col gap-1.5' data-testid='tl-limit-tiers'>
              <span className='text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--tl-mut)]'>{txa('Takviye seviyeleri')}</span>
              {TIERS.map((tier) => {
                const current = status.tier === tier || (tier === 3 && status.tier > 3)
                return (
                  <div key={tier} className={cn('flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-bold', current ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-fg)]' : 'border-[var(--tl-line)] text-[var(--tl-fg2)]')}>
                    <span>{txa('Seviye {v1}', { v1: tier })} <span className='font-semibold text-[var(--tl-mut)]'>· {txa('{v1} güç', { v1: status.tier_powers[String(tier)] ?? 0 })}</span></span>
                    <span className='tabular-nums'>{txa('ayda {v1} kredi', { v1: credits(status.tier_limits[String(tier)] ?? 0) })} <span className='font-semibold text-[var(--tl-mut)]'>· ≈{chapters(status.tier_limits[String(tier)] ?? 0)} {txa('bölüm')}</span></span>
                  </div>
                )
              })}
              <span className='text-[11.5px] font-semibold leading-relaxed text-[var(--tl-mut)]'>
                {txa('Her aktif takviye 1 güç verir ve 30 gün sürer. Ekibinin şu anki gücü: {v1}.', { v1: status.power })}
                {status.next_tier && status.next_tier_power !== null
                  ? ` ${txa('{v1} güç daha toplanınca aylık kredi {v2} olur.', { v1: Math.max(0, status.next_tier_power - status.power), v2: credits(status.next_tier_limit ?? 0) })}`
                  : ''}
              </span>
            </div>
          )}
          {!status.unlimited && !status.manual_quota && status.next_tier && (
            <Link to={boostHref} className='flex h-9 items-center justify-center gap-2 rounded-[10px] bg-[var(--tl-p)] text-[12.5px] font-extrabold text-[var(--tl-pfg)]'>
              <Rocket weight='bold' size={14} />
              {txa('Takviye sayfasına git')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Shown while the team is below boost tier 1: as its own screen on the new-chapter steps, as a
 * card on the start screen (existing work stays open to finish by hand and publish).
 */
export function StudioLockedScreen({ status, boostHref, variant = 'screen' }: { status: TlStudioStatus, boostHref: string, variant?: 'screen' | 'card' }) {
  const need = Math.max(0, (status.tier_powers['1'] ?? 0) - status.power)
  const card = (
      <div className='flex w-full max-w-[460px] flex-col gap-4 rounded-[18px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-7' data-testid='tl-studio-locked'>
        <span className='flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--tl-p15)] text-[var(--tl-p)]'>
          <LockSimple weight='bold' size={24} />
        </span>
        <div className='flex flex-col gap-1.5'>
          <h2 className='m-0 text-[22px] font-extrabold'>{txa('Çeviri Stüdyosu Takviye Seviye 1 ile açılır')}</h2>
          <span className='text-sm font-medium leading-relaxed text-[var(--tl-mut)]'>
            {txa('Ekibin şu an {v1} güçte. Stüdyonun açılması için {v2} güç daha gerekiyor; her aktif takviye 1 güç verir ve 30 gün sürer.', { v1: status.power, v2: need })}
          </span>
        </div>
        <div className='flex flex-col gap-1.5'>
          {TIERS.map((tier) => (
            <div key={tier} className='flex items-center justify-between rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-bold text-[var(--tl-fg2)]'>
              <span>{txa('Seviye {v1}', { v1: tier })} <span className='font-semibold text-[var(--tl-mut)]'>· {txa('{v1} güç', { v1: status.tier_powers[String(tier)] ?? 0 })}</span></span>
              <span>{tier === 1 ? txa('Stüdyo açılır · ayda {v1} kredi', { v1: credits(status.tier_limits['1'] ?? 0) }) : txa('ayda {v1} kredi', { v1: credits(status.tier_limits[String(tier)] ?? 0) })}</span>
            </div>
          ))}
        </div>
        <Link to={boostHref} className='flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[var(--tl-p)] text-[13px] font-extrabold text-[var(--tl-pfg)]'>
          <Rocket weight='bold' size={15} />
          {txa('Takviye sayfasına git')}
        </Link>
        {variant === 'card' && (
          <span className='text-xs font-semibold leading-relaxed text-[var(--tl-mut)]'>{txa('Süren çalışmalarını yapay zekâ olmadan tamamlayıp yayınlayabilirsin.')}</span>
        )}
      </div>
  )
  if (variant === 'card') return card
  return <div className='tl-screen flex flex-1 items-center justify-center p-6'>{card}</div>
}
