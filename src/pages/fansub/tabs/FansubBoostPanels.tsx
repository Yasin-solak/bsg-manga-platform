import { useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import {
  BookOpenText, CaretDown, ChartLineUp, Check, Crown, FireSimple, Heart, Lightning, ListChecks, Lock, LockOpen, Medal, Megaphone,
  Question, ShieldCheck, Smiley, Sparkle, Sticker, UsersThree, Warning,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { canRenderFansubSupporterSummary } from '@/lib/fansubBoostCapabilityGovernance'
import { resolveFansubBoostSupporterStatusLine } from '@/lib/fansubBoostPresentation'
import {
  DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES,
  normalizeFansubBoostCapabilityPolicies,
  type FansubBoostCapabilityPolicy,
} from '@/lib/fansubBoostPolicy'
import { cn } from '@/lib/utils'
import type { FansubBoostSnapshot, FansubBoostSupporterPreview, FansubBoostSupporterState } from '@/services/fansubBoostService'
import type { FansubDonationActivityItem } from '@/services/fansubService'
import { Panel, PanelEmpty, ToneIcon } from '../../profile/ProfileTabKit'
import { getTierState, type BoostIcon, type TierDefinition, type TierTone } from '../fansubBoostConstants'
import { buildSidebarContributionEntries, resolveAdminAlert, resolveTierProtectionInfo } from '../fansubBoostSidebarShared'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Boost tab (v2): power ring + progress to next level + one action on top, below it a
 * level ladder (what each level unlocks), supporters (with a permission gate) and always-on
 * features, FAQ at the bottom. Purchase and level detail windows are in the parent component.
 */

const TONE_INK: Record<TierTone, { text: string, ring: string, from: string, soft: string, solid: string }> = {
  rose: { text: 'text-rose-300', ring: 'stroke-rose-400', from: 'from-rose-500/25', soft: 'bg-rose-400/10 border-rose-400/30', solid: 'bg-rose-500' },
  violet: { text: 'text-violet-300', ring: 'stroke-violet-400', from: 'from-violet-500/25', soft: 'bg-violet-400/10 border-violet-400/30', solid: 'bg-violet-500' },
  amber: { text: 'text-amber-300', ring: 'stroke-amber-400', from: 'from-amber-500/25', soft: 'bg-amber-400/10 border-amber-400/30', solid: 'bg-amber-500' },
}

const toneOf = (level: number): TierTone | null => (level >= 3 ? 'amber' : level === 2 ? 'violet' : level === 1 ? 'rose' : null)

const FAQ = [
  { get q() { return txa('Takviye alınca ne olur?') }, get a() { return txa('Her takviye fansubun aktif gücüne eklenir. Yeterli güç birikince yeni seviye açılır ve sayfada yeni vitrin farkları görünür.') } },
  { get q() { return txa('Seviyeler nasıl açılır?') }, get a() { return txa('Seviyeler sırayla açılır. Eşikler sabittir: Seviye 1 için 3, Seviye 2 için 6, Seviye 3 için 12 güç gerekir.') } },
  { get q() { return txa('Takviye süresi bitince ne olur?') }, get a() { return txa('Aktif süre dolunca güç azalır. Yeterli güç kalmazsa fansub bir alt seviyeye iner.') } },
  { get q() { return txa('Birden fazla takviye alabilir miyim?') }, get a() { return txa('Evet. Her takviye bağımsız çalışır ve hepsi birlikte fansubun aktif gücüne eklenir.') } },
]

const CORE_ORDER = [
  'hasAnalytics', 'canUsePolls', 'canManagePinnedNotice', 'canUseSupporterList', 'canUseSupporterEmojiAssets',
  'canUseSupporterStickerAssets', 'canShowcaseManga', 'hasFoundingSupporter', 'hasSupporterStreak',
] as const

const CORE_ICON: Record<(typeof CORE_ORDER)[number], BoostIcon> = {
  hasAnalytics: ChartLineUp, canUsePolls: ListChecks, canManagePinnedNotice: Megaphone, canUseSupporterList: UsersThree,
  canUseSupporterEmojiAssets: Smiley, canUseSupporterStickerAssets: Sticker, canShowcaseManga: BookOpenText,
  hasFoundingSupporter: Medal, hasSupporterStreak: FireSimple,
}

function coreItems(policies: FansubBoostCapabilityPolicy[]) {
  const map = new Map(normalizeFansubBoostCapabilityPolicies(policies.length ? policies : DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES).map((p) => [p.capabilityKey, p]))
  return CORE_ORDER.flatMap((key) => {
    const policy = map.get(key)
    return policy && policy.placementType === 'core' ? [{ key, label: policy.label, summary: policy.summary, icon: CORE_ICON[key] }] : []
  })
}

function PowerRing({ power, percent, tone }: { power: number, percent: number, tone: TierTone | null }) {
  const radius = 52
  const length = 2 * Math.PI * radius
  return (
    <div className='relative size-[132px] flex-none'>
      <svg viewBox='0 0 120 120' className='size-full -rotate-90'>
        <circle cx='60' cy='60' r={radius} className='fill-none stroke-foreground/[0.08]' strokeWidth='9' />
        <circle
          cx='60' cy='60' r={radius}
          className={cn('fill-none transition-[stroke-dashoffset] duration-1000 ease-out', tone ? TONE_INK[tone].ring : 'stroke-primary')}
          strokeWidth='9' strokeLinecap='round'
          strokeDasharray={length} strokeDashoffset={length * (1 - Math.max(0.03, Math.min(1, percent / 100)))}
        />
      </svg>
      <span className='absolute inset-0 flex flex-col items-center justify-center'>
        <Lightning weight='fill' size={16} className={tone ? TONE_INK[tone].text : 'text-primary'} />
        <span className='text-[34px] font-black leading-none tabular-nums'>{power}</span>
        <span className='mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground'>{txa('güç')}</span>
      </span>
    </div>
  )
}

function StatusHero({ snapshot, tiers, isFansubAdmin, onBoost, supporters }: {
  snapshot: FansubBoostSnapshot | null
  tiers: TierDefinition[]
  isFansubAdmin: boolean
  onBoost: () => void
  supporters: { avatars: (string | null)[], count: number } | null
}) {
  const level = snapshot?.tierLevel ?? 0
  const power = snapshot?.activePower ?? 0
  const next = snapshot?.nextTierLevel ?? null
  const nextTier = next ? tiers.find((tier) => tier.level === next) ?? null : null
  const current = tiers.find((tier) => tier.level === level) ?? null
  const percent = next ? snapshot?.tierProgressPercent ?? 0 : 100
  const tone = toneOf(level)
  const protection = resolveTierProtectionInfo(snapshot, isFansubAdmin)
  const alert = resolveAdminAlert(snapshot, isFansubAdmin)

  return (
    <section className='relative isolate overflow-hidden rounded-[20px] border border-border/70 bg-card/60 p-5 sm:p-6' data-testid='fansub-boost-hero'>
      <span aria-hidden className={cn('absolute inset-0 -z-10 bg-gradient-to-br to-transparent to-60%', tone ? TONE_INK[tone].from : 'from-primary/15')} />
      <div className='flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7'>
        <PowerRing power={power} percent={percent} tone={tone} />
        <div className='flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:items-start sm:text-left'>
          <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em]', tone ? cn(TONE_INK[tone].soft, TONE_INK[tone].text) : 'border-border bg-muted text-muted-foreground')}>
            {level > 0 ? txa('Seviye {v1}', { v1: level }) : txa('Başlangıç')}
          </span>
          <h2 className='text-[22px] font-black leading-tight tracking-tight'>{current?.title ?? txa('Henüz seviye açılmadı')}</h2>
          <p className='text-[13px] text-muted-foreground'>
            {next
              ? <>{txa('Seviye {level} için {power} güç daha', { level: next ?? 0, power: snapshot?.nextTierRemainingPower ?? 0 })}{nextTier ? <> · {power} / {nextTier.threshold}</> : null}</>
              : txa('Tüm seviyeler açık. Yeni takviyeler bu seviyeyi korur.')}
          </p>
          {supporters && supporters.count > 0 && (
            <span className='mt-1 flex items-center gap-2'>
              <span className='flex -space-x-2'>
                {supporters.avatars.slice(0, 5).map((src, index) => (
                  src
                    ? <img key={index} src={src} alt='' className='size-7 rounded-full border-2 border-card object-cover' />
                    : <span key={index} className='size-7 rounded-full border-2 border-card bg-muted' />
                ))}
              </span>
              <span className='text-[12.5px] text-muted-foreground'><b className='text-foreground'>{supporters.count}</b>{txa(' kişi destekliyor')}</span>
            </span>
          )}
        </div>
        <Button onClick={onBoost} className='h-12 w-full flex-none rounded-2xl px-6 text-[15px] font-extrabold sm:w-auto' data-testid='fansub-boost-cta'>
          <Lightning weight='fill' size={17} />
          {txa('Takviye yap')}
        </Button>
      </div>

      {(protection || alert) && (
        <div className='mt-5 grid gap-2 sm:grid-cols-2'>
          {protection && (
            <div className='flex items-start gap-2.5 rounded-2xl border border-border/70 bg-background/40 px-3.5 py-3'>
              <ShieldCheck weight='duotone' size={17} className={cn('mt-0.5 flex-none', protection.daysRemaining <= 3 ? 'text-amber-400' : 'text-primary')} />
              <span className='text-[12px] leading-relaxed text-muted-foreground'>
                <b className='block text-foreground'>{txa('Seviye koruması')}</b>
                {protection.isExpired ? txa('Aktif takviye süresi doldu; seviye düşebilir.') : txa('{v1} tarihine kadar korunuyor ({v2} gün).', { v1: protection.formattedDate, v2: protection.daysRemaining })}
              </span>
            </div>
          )}
          {alert && (
            <div className={cn('flex items-start gap-2.5 rounded-2xl border px-3.5 py-3', alert.isUrgent ? 'border-destructive/30 bg-destructive/10' : 'border-amber-400/30 bg-amber-400/10')}>
              <Warning weight='fill' size={17} className={cn('mt-0.5 flex-none', alert.isUrgent ? 'text-destructive' : 'text-amber-400')} />
              <span className='text-[12px] leading-relaxed text-muted-foreground'>
                <b className='block text-foreground'>{alert.isUrgent ? txa('Seviye düşmek üzere') : txa('Koruma bitiyor')}</b>
                {alert.daysRemaining === 0 ? txa('Son aktif takviye bugün bitiyor.') : txa('{v1} gün içinde aktif takviye bitecek.', { v1: alert.daysRemaining })}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function TierLadder({ tiers, level, onTierClick }: { tiers: TierDefinition[], level: number, onTierClick: (level: number) => void }) {
  return (
    <Panel title={txa('Seviyeler')} icon={Crown} tone='amber' meta={txa('Her seviye fansubun sayfasına yeni bir şey ekler')} testId='fansub-boost-tiers'>
      <div className='grid gap-3 md:grid-cols-3'>
        {tiers.map((tier) => {
          const state = getTierState(tier.level, level)
          const ink = TONE_INK[tier.tone]
          const isCurrent = tier.level === level
          return (
            <button
              key={tier.level}
              type='button'
              onClick={() => onTierClick(tier.level)}
              className={cn(
                'group relative isolate flex flex-col overflow-hidden rounded-2xl border bg-background/40 p-4 text-left transition-all hover:-translate-y-0.5',
                isCurrent ? cn(ink.soft, 'ring-1 ring-inset ring-white/10') : state === 'locked' ? 'border-dashed border-border/80' : 'border-border/70',
              )}
            >
              <span aria-hidden className={cn('absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b to-transparent', state === 'locked' ? 'from-foreground/[0.03]' : ink.from)} />
              <span className='flex items-center justify-between gap-2'>
                <span className={cn('flex size-8 items-center justify-center rounded-[10px]', state === 'locked' ? 'bg-muted text-muted-foreground' : cn(ink.solid, 'text-white'))}>
                  {state === 'locked' ? <Lock weight='fill' size={15} /> : state === 'unlockable' ? <LockOpen weight='fill' size={15} /> : isCurrent ? <Lightning weight='fill' size={15} /> : <Check weight='bold' size={15} />}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-extrabold tabular-nums', state === 'locked' ? 'bg-muted text-muted-foreground' : cn('bg-background/60', ink.text))}>
                  {txa('{v1} güç', { v1: tier.threshold })}
                </span>
              </span>
              <span className={cn('mt-3 text-[16px] font-black', state === 'locked' ? 'text-muted-foreground' : ink.text)}>{txa('Seviye {v1}', { v1: tier.level })}</span>
              <span className='text-[12px] font-semibold text-muted-foreground'>
                {isCurrent ? txa('Şu an burada') : state === 'unlockable' ? txa('Sıradaki seviye') : state === 'locked' ? tier.title : txa('{v1} · açık', { v1: tier.title })}
              </span>
              <ul className='mt-3 flex flex-col gap-2 border-t border-border/50 pt-3'>
                {tier.features.map((feature) => (
                  <li key={feature.capabilityKey} className='flex items-center gap-2'>
                    <feature.icon weight='duotone' size={15} className={cn('flex-none', state === 'locked' ? 'text-muted-foreground/60' : ink.text)} />
                    <span className={cn('text-[12px] leading-tight', state === 'locked' ? 'text-muted-foreground' : 'text-foreground/85')}>{feature.label}</span>
                  </li>
                ))}
                <li className='flex items-center gap-2'>
                  <Smiley weight='duotone' size={15} className={cn('flex-none', state === 'locked' ? 'text-muted-foreground/60' : 'text-emerald-400')} />
                  <span className={cn('text-[12px] leading-tight', state === 'locked' ? 'text-muted-foreground' : 'text-foreground/85')}>
                    {txa('{v1} emoji · {v2} çıkartma', { v1: tier.assetQuota.emojiSlots, v2: tier.assetQuota.stickerSlots })}
                  </span>
                </li>
              </ul>
              <span className='mt-3 text-[11.5px] font-bold text-muted-foreground group-hover:text-foreground'>{txa('Ayrıntılar →')}</span>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

function SupportersPanel({ snapshot, supporterState, supporterPreview, recentDonationPreview }: {
  snapshot: FansubBoostSnapshot | null
  supporterState: FansubBoostSupporterState | null
  supporterPreview: FansubBoostSupporterPreview[]
  recentDonationPreview: FansubDonationActivityItem[]
}) {
  const entries = useMemo(() => buildSidebarContributionEntries(supporterPreview, recentDonationPreview), [supporterPreview, recentDonationPreview])
  const statusLine = supporterState ? resolveFansubBoostSupporterStatusLine(supporterState.rewardCapabilities, snapshot?.capabilities) : null
  const active = snapshot?.activeSupporterCount ?? entries.filter((entry) => entry.highestActivePlanCode).length
  const donors = entries.filter((entry) => entry.hasRecentDonation).length

  return (
    <Panel title={txa('Destekçiler')} icon={Heart} tone='rose' meta={txa('{v1} aktif destekçi · {v2} bağışçı (30 gün)', { v1: active, v2: donors })} testId='fansub-boost-supporters'>
      {supporterState?.activeGrantCount ? (
        <div className='mb-3 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[12.5px]'>
          <Heart weight='fill' size={14} className='text-primary' />
          <span><b>{txa('Sen de destekçisin.')}</b>{statusLine ? <span className='text-muted-foreground'> {statusLine}</span> : null}</span>
        </div>
      ) : null}
      {entries.length ? (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
          {entries.slice(0, 9).map((entry) => (
            <Link
              key={entry.userId}
              to={entry.usernameSlug ? `/profil/${encodeURIComponent(entry.usernameSlug)}` : '#'}
              className='flex min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-background/40 px-2.5 py-2 hover:border-border'
            >
              {entry.avatarUrl
                ? <img src={entry.avatarUrl} alt='' className='size-8 flex-none rounded-full object-cover' />
                : <span className='flex size-8 flex-none items-center justify-center rounded-full bg-muted text-xs font-bold'>{entry.username.charAt(0).toUpperCase()}</span>}
              <span className='min-w-0'>
                <span className='block truncate text-[12.5px] font-bold'>{entry.username}</span>
                <span className='block truncate text-[11px] text-muted-foreground'>
                  {entry.highestActivePlanCode && entry.hasRecentDonation ? txa('Takviye + bağış') : entry.highestActivePlanCode ? txa('Takviye') : txa('{v1} Coin bağış', { v1: entry.donationAmount30d.toLocaleString(intlLocale()) })}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : <PanelEmpty icon={Heart} title={txa('İlk destekçi sen ol')} hint={txa('Takviye ya da bağış yapanlar burada görünür.')} />}
    </Panel>
  )
}

function CorePanel({ policies }: { policies: FansubBoostCapabilityPolicy[] }) {
  const items = useMemo(() => coreItems(policies), [policies])
  if (!items.length) return null
  return (
    <Panel title={txa('Her zaman açık')} icon={Sparkle} tone='emerald' meta={txa('Seviyeden bağımsız, her fansubda')} testId='fansub-boost-core'>
      <ul className='flex flex-col gap-2.5'>
        {items.map((item) => (
          <li key={item.key} className='flex items-center gap-2.5'>
            <ToneIcon icon={item.icon} tone='emerald' size='sm' />
            <span className='text-[13px] font-semibold'>{item.label}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function FaqPanel() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <Panel title={txa('Sık sorulanlar')} icon={Question} tone='sky' testId='fansub-boost-faq'>
      <div className='flex flex-col divide-y divide-border/60'>
        {FAQ.map((item, index) => (
          <div key={item.q}>
            <button type='button' onClick={() => setOpen(open === index ? null : index)} className='flex w-full items-center justify-between gap-3 bg-transparent py-3 text-left text-[13.5px] font-bold' aria-expanded={open === index}>
              {item.q}
              <CaretDown weight='bold' size={13} className={cn('flex-none text-muted-foreground transition-transform', open === index && 'rotate-180')} />
            </button>
            {open === index && <p className='pb-3 text-[12.5px] leading-relaxed text-muted-foreground'>{item.a}</p>}
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function FansubBoostPanels({ snapshot, tiers, policies, isFansubAdmin, supporterState, supporterPreview, recentDonationPreview, onTierClick, onBoost }: {
  snapshot: FansubBoostSnapshot | null
  tiers: TierDefinition[]
  policies: FansubBoostCapabilityPolicy[]
  isFansubAdmin: boolean
  supporterState: FansubBoostSupporterState | null
  supporterPreview: FansubBoostSupporterPreview[]
  recentDonationPreview: FansubDonationActivityItem[]
  onTierClick: (level: number) => void
  onBoost: () => void
}) {
  // Supporter summary only if the permission is on (hidden for a fansub closed by admins).
  const canShowSupporterSummary = canRenderFansubSupporterSummary(snapshot?.capabilities, snapshot ? 'resolved' : 'unknown')
  return (
    <div className='flex flex-col gap-5'>
      <StatusHero
        snapshot={snapshot}
        tiers={tiers}
        isFansubAdmin={isFansubAdmin}
        onBoost={onBoost}
        supporters={canShowSupporterSummary ? { avatars: supporterPreview.map((entry) => entry.avatarUrl), count: snapshot?.activeSupporterCount ?? supporterPreview.length } : null}
      />
      <TierLadder tiers={tiers} level={snapshot?.tierLevel ?? 0} onTierClick={onTierClick} />
      <div className={cn('grid gap-5', canShowSupporterSummary && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]')}>
        {canShowSupporterSummary ? (
          <SupportersPanel snapshot={snapshot} supporterState={supporterState} supporterPreview={supporterPreview} recentDonationPreview={recentDonationPreview} />
        ) : null}
        <CorePanel policies={policies} />
      </div>
      <FaqPanel />
    </div>
  )
}
