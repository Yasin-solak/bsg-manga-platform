/**
 * FansubYonetBoostTab v2: studio 'Boost' tab.
 *
 * Top strip: level, active power and progress to the next threshold. A level ladder in the middle
 * (Base + Levels 1-3): each feature on / locked, with a shortcut to the related tab. Below, a
 * supporter summary and recent donations. Feature-level mapping comes from the default policy,
 * "is it on" from live snapshot.capabilities.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import {
  ArrowClockwise,
  ArrowSquareOut,
  CheckCircle,
  Copy,
  Crown,
  HandHeart,
  LockSimple,
  RocketLaunch,
  Star,
  Users,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  BOOST_FRAME_STYLE_OPTIONS,
  resolveBoostFrameStyle,
  type BoostFrameStyle,
} from '@/components/common/FansubBoostChrome'
import { cn } from '@/lib/utils'
import { DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES, DEFAULT_FANSUB_BOOST_TIER_THRESHOLDS } from '@/lib/fansubBoostPolicy'
import { resolveFansubBoostMilestoneState } from '@/lib/fansubBoostPresentation'
import { buildPathWithQuery, buildPublicFansubPath } from '@/lib/routes'
import {
  getFansubManageBoostRewardSummary,
  type FansubBoostSnapshot,
  type FansubManageBoostRewardSummary,
} from '@/services/fansubBoostService'
import { listFansubDonationActivity, type FansubDonationActivityItem } from '@/services/fansubService'
import { toast } from '@/services/toastService'
import { Meter, Panel } from '@/pages/profile/ProfileTabKit'
import type { Fansub } from '@/types'
import { formatRelative } from './FansubYonetOverviewPanels'
import { StudioStatStrip } from './StudioStatStrip'
import type { FansubYonetTab } from './useFansubYonetState'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubYonetBoostTabProps {
  fansub: Fansub
  fansubId: string
  isBoostEnabled: boolean
  boostSnapshot: FansubBoostSnapshot | null
  canCreateContent: boolean
  onTabChange: (tab: FansubYonetTab) => void
  onBoostFrameStyleChange?: (style: BoostFrameStyle) => void
}

/** Feature names (UI) + related studio tab. Policy labels are ASCII, so they get proper Turkish here. */
const FEATURE_META: Record<string, { label: string; tab?: FansubYonetTab }> = {
  hasAnalytics: { get label() { return txa('Temel istatistikler') }, tab: 'istatistikler' },
  canUsePolls: { get label() { return txa('Mini anket') } },
  canManagePinnedNotice: { get label() { return txa('Profil duyuruları') }, tab: 'duyurular' },
  canUseSupporterList: { get label() { return txa('Destekçi listesi') } },
  canUseSupporterEmojiAssets: { get label() { return txa('Destekçi emojileri') }, tab: 'ifadeler' },
  canUseSupporterStickerAssets: { get label() { return txa('Destekçi çıkartmaları') }, tab: 'ifadeler' },
  canShowcaseManga: { get label() { return txa('Seri vitrini') } },
  hasSupporterStreak: { get label() { return txa('Destek serisi') } },
  hasFoundingSupporter: { get label() { return txa('Kurucu destekçi') } },
  hasChapterEndCredit: { get label() { return txa('Kapanış şeridi') }, tab: 'kapanis-kredisi' },
  canUploadStaticBackground: { get label() { return txa('Görsel arka plan') } },
  canUploadVideoBackground: { get label() { return txa('Video arka plan') } },
  hasDiscoverBadge: { get label() { return txa('Topluluk destekli rozeti') } },
  hasFansubIdentityTags: { get label() { return txa('Fansub etiketi') } },
  canUseSpecialNotifications: { get label() { return txa('Takipçilere özel bildirim') }, tab: 'duyurular' },
  hasFullNameStyle: { get label() { return txa('Gelişmiş isim stili') } },
  hasGoldFrame: { get label() { return txa('Takviye çerçevesi') } },
  hasVanityUrl: { get label() { return txa('Özel fansub adresi') } },
  hasAdvancedAnalytics: { get label() { return txa('Gelişmiş istatistikler') }, tab: 'istatistikler' },
}

const LEVEL_TITLES = ['Temel', 'Görünür destek', 'Topluluk etkisi', 'Prestij']

const FRAME_LABELS: Record<BoostFrameStyle, string> = { get gold() { return txa('Altın') }, get rose() { return txa('Gül') }, get violet() { return txa('Mor') }, get sapphire() { return txa('Safir') }, get emerald() { return txa('Zümrüt') } }
const FRAME_PREVIEW: Record<BoostFrameStyle, string> = {
  gold: 'from-amber-300 via-amber-500 to-amber-300',
  rose: 'from-rose-300 via-rose-500 to-rose-300',
  violet: 'from-violet-300 via-violet-500 to-violet-300',
  sapphire: 'from-blue-300 via-blue-500 to-blue-300',
  emerald: 'from-emerald-300 via-emerald-500 to-emerald-300',
}

function buildLadder() {
  const levels = [0, ...DEFAULT_FANSUB_BOOST_TIER_THRESHOLDS.map((_, index) => index + 1)]
  return levels.map((level) => ({
    level,
    threshold: level === 0 ? 0 : DEFAULT_FANSUB_BOOST_TIER_THRESHOLDS[level - 1],
    title: LEVEL_TITLES[level] ? txa(LEVEL_TITLES[level]) : txa('Seviye {v1}', { v1: level }),
    features: DEFAULT_FANSUB_BOOST_CAPABILITY_POLICIES
      .filter((policy) => (level === 0 ? policy.placementType === 'core' : policy.placementType === 'tier' && policy.tierLevel === level))
      .map((policy) => ({ key: policy.capabilityKey, label: FEATURE_META[policy.capabilityKey]?.label || policy.label, tab: FEATURE_META[policy.capabilityKey]?.tab })),
  }))
}

const LADDER = buildLadder()
const fmt = (value: number | null | undefined) => Math.max(0, value || 0).toLocaleString(intlLocale())

export default function FansubYonetBoostTab({
  fansub,
  fansubId,
  isBoostEnabled,
  boostSnapshot,
  canCreateContent,
  onTabChange,
  onBoostFrameStyleChange,
}: FansubYonetBoostTabProps) {
  const [donations, setDonations] = useState<FansubDonationActivityItem[]>([])
  const [isDonationsLoading, setIsDonationsLoading] = useState(false)
  const [donationsError, setDonationsError] = useState<string | null>(null)
  const [rewardSummary, setRewardSummary] = useState<FansubManageBoostRewardSummary | null>(null)
  const [isRewardSummaryLoading, setIsRewardSummaryLoading] = useState(false)
  const currentFrameStyle = resolveBoostFrameStyle(fansub.boostFrameStyle)

  const milestone = resolveFansubBoostMilestoneState(boostSnapshot, fansub.name)
  const capabilities = (boostSnapshot?.capabilities ?? {}) as Record<string, unknown>
  const tierLevel = boostSnapshot?.tierLevel || 0
  const nextLevel = milestone.nextTierLevel ?? tierLevel + 1
  const publicBoostHref = buildPathWithQuery(buildPublicFansubPath({ id: fansub.id, slug: fansub.slug }), { tab: 'takviye' })
  const shareText = milestone.isMaxTier
    ? txa('{v1} tüm takviye seviyelerini açtı. Desteğin için teşekkürler!', { v1: fansub.name })
    : txa('{v1} için {v2} takviye gücü daha gelirse Seviye {v3} açılıyor. Destek olmak istersen fansub sayfasındaki Takviye sekmesine göz at.', { v1: fansub.name, v2: fmt(milestone.remainingPower), v3: nextLevel })

  const loadDonations = useCallback(async () => {
    if (!canCreateContent) {
      setDonations([])
      setDonationsError(null)
      return
    }
    setIsDonationsLoading(true)
    setDonationsError(null)
    try {
      setDonations(await listFansubDonationActivity(fansubId, { limit: 30 }))
    } catch (error) {
      console.error('[FansubYonetBoostTab] loadDonations error', error)
      setDonationsError(txa('Bağış listesi yüklenemedi.'))
    } finally {
      setIsDonationsLoading(false)
    }
  }, [canCreateContent, fansubId])

  const loadRewardSummary = useCallback(async () => {
    if (!canCreateContent) {
      setRewardSummary(null)
      return
    }
    setIsRewardSummaryLoading(true)
    try {
      setRewardSummary(await getFansubManageBoostRewardSummary(fansubId))
    } catch (error) {
      console.error('[FansubYonetBoostTab] loadRewardSummary error', error)
      setRewardSummary(null)
    } finally {
      setIsRewardSummaryLoading(false)
    }
  }, [canCreateContent, fansubId])

  useEffect(() => { void loadDonations() }, [loadDonations])
  useEffect(() => { void loadRewardSummary() }, [loadRewardSummary])

  const handleCopy = async () => {
    if (!navigator?.clipboard) {
      toast.error(txa('Panoya kopyalama bu cihazda desteklenmiyor.'))
      return
    }
    try {
      await navigator.clipboard.writeText(shareText)
      toast.success(txa('Paylaşım metni kopyalandı.'))
    } catch {
      toast.error(txa('Metin kopyalanamadı.'))
    }
  }

  const refreshAll = () => {
    void loadDonations()
    void loadRewardSummary()
  }

  return (
    <div className="flex flex-col gap-4" data-testid="studio-boost-tab">
      {!isBoostEnabled && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5 text-[12.5px] text-amber-700 dark:text-amber-300">
          {txa('Takviye sistemi şu an site genelinde kapalı. Seviyeler korunuyor; sistem açılınca kaldığın yerden devam eder.')}
        </p>
      )}

      {/* Durum seridi */}
      <section className="grid gap-4 rounded-[20px] border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.12] via-card/70 to-card/60 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-amber-600 dark:text-amber-300">
            <RocketLaunch size={15} weight="fill" />
            {tierLevel ? txa('Seviye {v1} · {v2}', { v1: tierLevel, v2: txa(LEVEL_TITLES[tierLevel] || '') }) : txa('Temel seviye')}
          </span>
          <span className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[34px] font-black leading-none tracking-tight tabular-nums">{fmt(boostSnapshot?.activePower)}</span>
            <span className="text-[13px] font-semibold text-muted-foreground">{txa('aktif güç')}</span>
          </span>
          <Meter percent={milestone.isMaxTier ? 100 : boostSnapshot?.tierProgressPercent || 0} className="mt-3 max-w-[520px]" barClassName="from-amber-400 to-amber-300" />
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            {milestone.isMaxTier
              ? txa('Tüm seviyeler açık. Yeni takviyeler seviyeyi korur.')
              : <><b className="text-foreground">{txa('{v1} güç', { v1: fmt(milestone.remainingPower) })}</b> {txa('sonra Seviye {v1} ({v2}) açılır.', { v1: nextLevel, v2: LEVEL_TITLES[nextLevel] || '' })}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void handleCopy()} title={shareText}>
            <Copy size={14} />{txa('Paylaşım metnini kopyala')}
          </Button>
          <Button asChild type="button" variant="ghost" size="sm" className="rounded-full">
            <Link to={publicBoostHref}>{txa('Takviye sayfasını aç')}<ArrowSquareOut size={13} /></Link>
          </Button>
        </div>
      </section>

      <StudioStatStrip
        items={[
          { key: 'supporters', icon: Users, tone: 'primary', label: txa('Aktif destekçi'), value: fmt(boostSnapshot?.activeSupporterCount), sub: txa('{v1} aktif takviye', { v1: fmt(boostSnapshot?.activeGrantCount) }) },
          { key: 'founding', icon: Star, tone: 'amber', label: txa('Kurucu destekçi'), value: fmt(rewardSummary?.activeFoundingSupporterCount), sub: rewardSummary ? txa('{v1} slot boş', { v1: fmt(rewardSummary.remainingFoundingSlots) }) : '—' },
          { key: 'streak', icon: CheckCircle, tone: 'violet', label: txa('Destek serisi'), value: fmt(rewardSummary?.activeStreakSupporterCount), sub: rewardSummary ? txa('rekor {v1} dönem', { v1: fmt(Math.max(rewardSummary.bestActiveStreakCount, rewardSummary.bestLifetimeStreakCount)) }) : '—' },
          { key: 'last', icon: HandHeart, tone: 'emerald', label: txa('Son takviye'), value: rewardSummary?.lastGrantedAt ? formatRelative(rewardSummary.lastGrantedAt) : '—', sub: rewardSummary ? txa('{v1} görünür destekçi', { v1: fmt(rewardSummary.visibleSupporterCount) }) : txa('henüz yok') },
        ]}
      />

      {/* Seviye merdiveni */}
      <Panel title={txa('Seviyeler')} icon={Crown} tone="amber" meta={txa('Takviye gücü arttıkça açılan özellikler')} testId="studio-boost-ladder">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {LADDER.map((step) => {
            const reached = tierLevel >= step.level
            const isNext = !milestone.isMaxTier && step.level === nextLevel
            return (
              <div
                key={step.level}
                className={cn(
                  'flex flex-col rounded-2xl border p-3.5',
                  reached ? 'border-amber-500/35 bg-amber-500/[0.06]' : isNext ? 'border-border bg-background/40' : 'border-border/60 bg-background/20',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-black">{step.level === 0 ? txa('Temel') : `Seviye ${step.level}`}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground">{step.level === 0 ? txa('herkese açık') : txa('{v1} güç', { v1: step.threshold })}</span>
                </div>
                <span className="text-[11.5px] text-muted-foreground">
                  {step.title}
                  {reached ? txa(' · açık') : isNext ? txa(' · {v1} güç kaldı', { v1: fmt(milestone.remainingPower) }) : ''}
                </span>
                <ul className="mt-2.5 flex flex-col gap-1">
                  {step.features.map((feature) => {
                    // Base features count as on if absent from the snapshot; level features must be explicitly true.
                    const open = step.level === 0 ? capabilities[feature.key] !== false : isBoostEnabled && capabilities[feature.key] === true
                    const content = (
                      <>
                        {open ? <CheckCircle size={14} weight="fill" className="flex-none text-emerald-500" /> : <LockSimple size={14} className="flex-none text-muted-foreground/70" />}
                        <span className={cn('min-w-0 flex-1 truncate', !open && 'text-muted-foreground')}>{feature.label}</span>
                      </>
                    )
                    return (
                      <li key={feature.key}>
                        {feature.tab && open ? (
                          <button type="button" onClick={() => onTabChange(feature.tab!)} className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-lg px-1.5 py-0.5 text-left text-[12.5px] hover:bg-accent/50">
                            {content}
                            <ArrowSquareOut size={12} className="flex-none text-muted-foreground opacity-0 group-hover:opacity-100" />
                          </button>
                        ) : (
                          <span className="flex items-center gap-2 py-0.5 text-[12.5px]">{content}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Panel
          title={txa('Son bağışlar')}
          icon={HandHeart}
          tone="emerald"
          meta={canCreateContent ? txa('{v1} kayıt', { v1: fmt(donations.length) }) : txa('Yalnız fansub yöneticileri görür')}
          className="xl:col-span-8"
          testId="studio-boost-donations"
        >
          {canCreateContent && (
            <div className="-mt-1 mb-2 flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full text-[12px]" onClick={refreshAll} disabled={isDonationsLoading || isRewardSummaryLoading}>
                <ArrowClockwise size={13} className={cn(isDonationsLoading && 'animate-spin')} />{txa('Yenile')}
              </Button>
            </div>
          )}
          {!canCreateContent ? (
            <p className="text-[12.5px] text-muted-foreground">{txa('Bağışçı adları ve notları yalnız fansub yöneticilerine açıktır.')}</p>
          ) : isDonationsLoading && !donations.length ? (
            <p className="py-6 text-center text-[12.5px] text-muted-foreground">{txa('Yükleniyor…')}</p>
          ) : donationsError ? (
            <p className="text-[12.5px] text-destructive">{donationsError}</p>
          ) : !donations.length ? (
            <p className="text-[12.5px] text-muted-foreground">{txa('Henüz bağış yok. Paylaşım metnini topluluğunla paylaşarak ilk desteği isteyebilirsin.')}</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {donations.slice(0, 8).map((donation) => {
                const donorName = donation.donor?.username || txa('Silinmiş kullanıcı')
                return (
                  <li key={donation.id} className="flex items-center gap-3 py-2">
                    <span className="size-8 flex-none overflow-hidden rounded-full bg-muted">
                      {donation.donor?.avatarUrl
                        ? <img src={donation.donor.avatarUrl} alt="" className="size-full object-cover" />
                        : <span className="flex size-full items-center justify-center text-[12px] font-bold text-muted-foreground">{donorName.slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{donorName}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{donation.note ? `“${donation.note}”` : txa('Not bırakmadı')} · {formatRelative(donation.createdAt)}</span>
                    </span>
                    <span className="flex-none text-[13px] font-black tabular-nums text-emerald-500">+{fmt(donation.amount)}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {canCreateContent && donations.length > 8 && (
            <Button type="button" variant="ghost" size="sm" className="mt-1 w-full rounded-full" onClick={() => onTabChange('kasa')}>
              {txa('Tüm hareketler Kasa sekmesinde')}
            </Button>
          )}
        </Panel>

        <Panel title={txa('Takviye çerçevesi')} icon={Crown} tone="violet" meta={capabilities.hasGoldFrame === true ? txa('Seçili: {v1}', { v1: FRAME_LABELS[currentFrameStyle] }) : txa('Seviye 3 ile açılır')} className="xl:col-span-4">
          <div className="grid grid-cols-5 gap-2">
            {BOOST_FRAME_STYLE_OPTIONS.map((option) => {
              const isSelected = currentFrameStyle === option.value
              const locked = capabilities.hasGoldFrame !== true
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={locked}
                  onClick={() => onBoostFrameStyleChange?.(option.value)}
                  title={FRAME_LABELS[option.value]}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                    isSelected && !locked ? 'border-primary bg-primary/5 text-primary' : 'border-border/60 text-muted-foreground enabled:hover:border-border',
                  )}
                >
                  <span className={cn('size-7 rounded-full bg-gradient-to-br shadow-sm ring-2 ring-background', FRAME_PREVIEW[option.value])} />
                  {FRAME_LABELS[option.value]}
                </button>
              )
            })}
          </div>
        </Panel>
      </div>
    </div>
  )
}
