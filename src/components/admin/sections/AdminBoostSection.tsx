import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { Activity, ArrowUpRight, Coins, Flame, HeartPulse, RefreshCw, Sparkles, Users, Zap, type LucideIcon } from 'lucide-react'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { Button } from '@/components/ui/button'
import { getFansubBoostDowngradeRule } from '@/lib/fansubBoostCapabilityGovernance'
import { cn } from '@/lib/utils'
import { listAdminFeatureFlags, setAdminFeatureFlag, type AdminFeatureFlagItem } from '@/services/adminOpsService'
import {
  getAdminBoostControlCenter,
  updateAdminBoostCapabilityPolicy,
  type AdminBoostCapabilityPolicyRow,
  type AdminBoostControlCenter,
} from '@/services/adminBoostControlService'
import { toast } from '@/services/toastService'
import {
  buildFlagMap,
  CapabilityRow,
  encodePolicyPlacement,
  formatNumberTr,
  formatRelativeAge,
  placementLabel,
  RUNTIME_FLAG_SPECS,
  RuntimeFlagRow,
  TierRow,
  tierName,
  toErrorMessage,
} from '@/components/admin/sections/adminBoost/adminBoostSection.shared'
import { txa, intlLocale } from '@/i18n/activeLocale'

type BoostTab = 'capabilities' | 'fansubs' | 'status'

const TABS: Array<{ id: BoostTab, label: string, icon: LucideIcon }> = [
  { id: 'capabilities', get label() { return txa('Ayrıcalıklar') }, icon: Sparkles },
  { id: 'fansubs', get label() { return txa('Ekipler') }, icon: Users },
  { id: 'status', get label() { return txa('Durum') }, icon: HeartPulse },
]

function StripCell({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon, tone: string, label: string, value: string, hint: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden', tone)}><Icon className="size-[18px]" /></span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{label}</span>
        <span className="block text-[20px] font-black leading-tight tabular-nums">{value}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </div>
  )
}

function Panel({ title, meta, action, children, testId }: { title: string, meta?: string, action?: ReactNode, children: ReactNode, testId?: string }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" data-testid={testId}>
      <header className="flex items-center gap-2 border-b border-border/60 px-5 py-3.5">
        <span className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {meta ? <span className="block text-[12px] text-muted-foreground">{meta}</span> : null}
        </span>
        {action}
      </header>
      {children}
    </section>
  )
}

function HealthRow({ label, value, hint, warn }: { label: string, value: number, hint: string, warn?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">{hint}</span>
      </span>
      <span className={cn('rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums', warn && value > 0 ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>{formatNumberTr(value)}</span>
    </li>
  )
}

/**
 * Boost v2. Readers boost fansubs; when total power passes thresholds the
 * team levels up and that level's perks open. Perks: which
 * feature at which level (through a dialog stating the change's effect). Teams:
 * level distribution and top boosted. Status: system switches
 * (turning off needs confirmation) and consistency signals.
 */
export default function AdminBoostSection() {
  const [dashboard, setDashboard] = useState<AdminBoostControlCenter | null>(null)
  const [flagsByKey, setFlagsByKey] = useState<Record<string, AdminFeatureFlagItem>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flagsError, setFlagsError] = useState<string | null>(null)
  const [savingFlagKey, setSavingFlagKey] = useState<string | null>(null)
  const [savingCapabilityKey, setSavingCapabilityKey] = useState<string | null>(null)
  const [tab, setTab] = useState<BoostTab>('capabilities')
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [dashboardResult, flagsResult] = await Promise.allSettled([getAdminBoostControlCenter(), listAdminFeatureFlags()])
    if (dashboardResult.status === 'fulfilled') {
      setDashboard(dashboardResult.value)
      setError(null)
    } else {
      setError(toErrorMessage(dashboardResult.reason, txa('Takviye verisi yüklenemedi.')))
    }
    if (flagsResult.status === 'fulfilled') {
      setFlagsByKey(buildFlagMap(flagsResult.value))
      setFlagsError(null)
    } else {
      setFlagsError(toErrorMessage(flagsResult.reason, txa('Sistem anahtarları okunamadı.')))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const runtimeFlags = useMemo(() => RUNTIME_FLAG_SPECS.map((spec) => ({ spec, flag: flagsByKey[spec.key] })), [flagsByKey])
  const boostOn = flagsByKey['boost.system']?.isEnabled === true

  async function saveFlag(flag: AdminFeatureFlagItem, nextValue: boolean) {
    setSavingFlagKey(flag.key)
    try {
      const savedFlag = await setAdminFeatureFlag({
        key: flag.key,
        label: flag.label,
        description: flag.description,
        isEnabled: nextValue,
        rolloutPercent: flag.rolloutPercent,
        isPublic: flag.isPublic,
        metadata: flag.metadata,
      })
      setFlagsByKey((prev) => ({ ...prev, [savedFlag.key]: savedFlag }))
      toast.success(nextValue ? txa('{v1} açıldı.', { v1: flag.label }) : txa('{v1} kapatıldı.', { v1: flag.label }))
    } catch (toggleError) {
      toast.error(toErrorMessage(toggleError, txa('Anahtar değiştirilemedi.')))
    } finally {
      setSavingFlagKey(null)
    }
  }

  const toggleFlag = (specKey: string, nextValue: boolean) => {
    const flag = flagsByKey[specKey]
    const spec = RUNTIME_FLAG_SPECS.find((entry) => entry.key === specKey)
    if (!flag || !spec) return
    if (nextValue) {
      void saveFlag(flag, true)
      return
    }
    setConfirm({
      title: txa('{v1} kapat', { v1: spec.label }),
      subject: spec.hint,
      consequence: spec.offConsequence,
      confirmLabel: txa('Kapat'),
      destructive: true,
      run: () => saveFlag(flag, false),
    })
  }

  async function saveCapability(row: AdminBoostCapabilityPolicyRow, nextValue: string) {
    const [placementType, levelValue] = nextValue.split(':')
    setSavingCapabilityKey(row.capabilityKey)
    try {
      await updateAdminBoostCapabilityPolicy({
        capabilityKey: row.capabilityKey,
        placementType: placementType === 'tier' ? 'tier' : placementType === 'core' ? 'core' : 'disabled',
        tierLevel: placementType === 'tier' ? Number(levelValue || 1) : null,
      })
      await loadData()
      toast.success(`${row.label}: ${placementLabel(nextValue).toLocaleLowerCase(intlLocale())}.`)
    } catch (policyError) {
      toast.error(toErrorMessage(policyError, txa('Ayrıcalık seviyesi değiştirilemedi.')))
    } finally {
      setSavingCapabilityKey(null)
    }
  }

  const changeCapability = (row: AdminBoostCapabilityPolicyRow, nextValue: string) => {
    const current = encodePolicyPlacement(row)
    if (nextValue === current) return
    const rank = (value: string) => (value === 'core' ? 0 : value === 'disabled' ? 99 : Number(value.split(':')[1] || 1))
    const stricter = rank(nextValue) > rank(current)
    setConfirm({
      title: `${row.label}: ${placementLabel(nextValue).toLocaleLowerCase(intlLocale())}`,
      subject: txa('Şu an {v1} · {v2} ekip kullanıyor', { v1: placementLabel(current).toLocaleLowerCase(intlLocale()), v2: formatNumberTr(row.liveFansubCount) }),
      consequence: nextValue === 'disabled'
        ? txa('Ayrıcalık tüm ekipler için kapanır. {v1}', { v1: getFansubBoostDowngradeRule(row.capabilityKey).detail })
        : stricter
          ? txa('Seviyesi yetmeyen ekipler ayrıcalığı kaybeder. {v1}', { v1: getFansubBoostDowngradeRule(row.capabilityKey).detail })
          : txa('Daha fazla ekip bu ayrıcalığı kullanabilir hale gelir.'),
      confirmLabel: txa('Değiştir'),
      destructive: stricter,
      run: () => saveCapability(row, nextValue),
    })
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    try {
      await confirm.run()
      setConfirm(null)
    } finally {
      setConfirmBusy(false)
    }
  }

  const header = (
    <AdminSectionHeader
      title={txa('Takviye')}
      description={txa('Okurlar fansublara takviye verir; toplam güç eşikleri geçince ekip seviye atlar ve ayrıcalıklar açılır.')}
      actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={loading} onClick={() => { void loadData() }}><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{txa('Yenile')}</Button>}
    />
  )

  if (!dashboard) {
    return (
      <section className="flex flex-col gap-4" data-testid="admin-boost">
        {header}
        {loading ? (
          <div className="flex flex-col gap-3">{[0, 1, 2].map((index) => <div key={index} className="h-24 animate-pulse rounded-[20px] bg-muted/40" />)}</div>
        ) : (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error ?? txa('Takviye verisi alınamadı.') })}</p>
        )}
      </section>
    )
  }

  const { overview, health, policy } = dashboard
  const totalFansubs = Math.max(overview.totalFansubCount, 1)
  const thresholds = policy.tierThresholds.length ? policy.tierThresholds : [3, 6, 12]

  return (
    <section className="flex flex-col gap-4" data-testid="admin-boost">
      {header}

      {!boostOn && Object.keys(flagsByKey).length ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-200" data-testid="boost-off">
          {txa('Takviye sistemi kapalı: okurlar takviye veremiyor ve ayrıcalıklar sitede çalışmıyor. Durum sekmesinden açabilirsin.')}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Takviye özeti')} data-testid="boost-strip">
        <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          <StripCell icon={Zap} tone="bg-primary/10 text-primary" label={txa('Takviyeli ekip')} value={formatNumberTr(overview.boostedFansubCount)} hint={txa('{v1} ekipten · {v2} güç', { v1: formatNumberTr(overview.totalFansubCount), v2: formatNumberTr(overview.totalActivePower) })} />
          <StripCell icon={Users} tone="bg-sky-500/10 text-sky-500" label={txa('Aktif destekçi')} value={formatNumberTr(overview.uniqueActiveSupporterCount)} hint={txa('{v1} süren takviye', { v1: formatNumberTr(overview.activeGrantCount) })} />
          <StripCell icon={Flame} tone="bg-rose-500/10 text-rose-500" label={txa('30 günde takviye')} value={formatNumberTr(overview.grantCount30d)} hint={txa('{v1} güç', { v1: formatNumberTr(overview.grantedPower30d) })} />
          <StripCell icon={Coins} tone="bg-amber-500/10 text-amber-500" label={txa('30 günde bağış')} value={formatNumberTr(overview.donationCount30d)} hint={`${formatNumberTr(overview.donationAmount30d)} coin`} />
        </div>
      </section>

      <div className="inline-flex self-start rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Takviye bölümleri')}>
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} data-testid={`boost-tab-${item.id}`} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', tab === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <item.icon className="size-3.5" />{item.label}
          </button>
        ))}
      </div>

      {tab === 'capabilities' ? (
        <Panel
          title={txa('Ayrıcalıklar')}
          meta={txa('Seviye eşikleri: {v1}. Sağdaki sayı: kullanan / seviyesi yeten ekip.', { v1: thresholds.map((value, index) => txa('{v1}. seviye {v2} güç', { v1: index + 1, v2: formatNumberTr(value) })).join(' · ') })}
          testId="boost-capabilities"
        >
          <ul className="divide-y divide-border/50">
            {dashboard.capabilityPolicies.map((row) => (
              <CapabilityRow key={row.capabilityKey} row={row} saving={savingCapabilityKey === row.capabilityKey} onChange={changeCapability} />
            ))}
          </ul>
        </Panel>
      ) : null}

      {tab === 'fansubs' ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Panel
            title={txa('En çok takviye alan ekipler')}
            action={<Button size="sm" variant="ghost" className="h-8 gap-1 text-[12px]" asChild><Link to="/admin/fansublar">{txa('Fansublar')}<ArrowUpRight className="size-3.5" /></Link></Button>}
            testId="boost-top-fansubs"
          >
            {dashboard.topFansubs.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">{txa('Şu an takviye alan ekip yok.')}</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {dashboard.topFansubs.map((row, index) => (
                  <li key={row.fansubId} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-6 shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">{row.name}</span>
                        <span className="shrink-0 rounded-md bg-violet-500/12 px-1.5 py-px text-[10.5px] font-bold text-violet-700 dark:text-violet-300">{tierName(row.tierLevel)}</span>
                      </span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{txa('{v1} destekçi · son takviye {v2}', { v1: formatNumberTr(row.activeSupporterCount), v2: formatRelativeAge(row.lastGrantAt) })}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums">{formatNumberTr(row.activePower)} <span className="text-[11px] font-normal text-muted-foreground">{txa('güç')}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title={txa('Seviye dağılımı')} meta={txa('{v1} aktif ekip', { v1: formatNumberTr(overview.totalFansubCount) })} testId="boost-tiers">
              <ul className="divide-y divide-border/50">
                {dashboard.tiers.map((row) => <TierRow key={row.tierLevel} row={row} totalFansubs={totalFansubs} threshold={row.tierLevel > 0 ? thresholds[row.tierLevel - 1] : undefined} />)}
              </ul>
            </Panel>
            <Panel title={txa('Destekçi kimlikleri')} meta={txa('İlk {v1} destekçi kurucu sayılır; seri için ara toleransı {v2} gün.', { v1: formatNumberTr(policy.foundingLimit), v2: formatNumberTr(policy.streakGraceDays) })}>
              <dl className="grid grid-cols-3 gap-px bg-border/50 [&>*]:bg-card">
                {([[txa('Kurucu'), overview.activeFoundingSupporterCount], [txa('Seri'), overview.activeStreakSupporterCount], [txa('Tekrar destek'), overview.repeatSupporterCount]] as const).map(([label, value]) => (
                  <div key={label} className="px-4 py-3">
                    <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
                    <dd className="text-[18px] font-black tabular-nums">{formatNumberTr(value)}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === 'status' ? (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel
            title={txa('Sistem anahtarları')}
            meta={txa('Kapatmak sonucu soran pencereden geçer.')}
            action={<Button size="sm" variant="ghost" className="h-8 gap-1 text-[12px]" asChild><Link to="/admin/operasyon#feature-flags">{txa('Tüm anahtarlar')}<ArrowUpRight className="size-3.5" /></Link></Button>}
            testId="boost-flags"
          >
            <ul className="divide-y divide-border/50">
              {runtimeFlags.map(({ spec, flag }) => (
                <RuntimeFlagRow key={spec.key} spec={spec} flag={flag} saving={savingFlagKey === spec.key} onToggle={(next) => toggleFlag(spec.key, next)} />
              ))}
            </ul>
            {flagsError ? <p className="border-t border-border/60 px-5 py-2.5 text-[12px] text-destructive">{flagsError}</p> : null}
          </Panel>
          <Panel title={txa('Tutarlılık')} meta={txa('Son takviye {v1} · son bağış {v2}', { v1: formatRelativeAge(health.lastGrantAt), v2: formatRelativeAge(health.lastDonationAt) })} testId="boost-health">
            <ul className="divide-y divide-border/50">
              <HealthRow label={txa('7 günde bitecek takviye')} value={health.expiringGrantCount7d} hint={txa('Yenilenmezse ekiplerin gücü düşer.')} warn />
              <HealthRow label={txa('Güncellenmemiş seviye kaydı')} value={health.staleSnapshotCount} hint={txa('48 saatten eski seviye hesabı; arka plan işi gecikmiş olabilir.')} warn />
              <HealthRow label={txa('Ödül durumu eksik')} value={health.missingRewardStateCount} hint={txa('Süren takviyesi olup ödül kaydı oluşmamış ekip.')} warn />
              <HealthRow label={txa('Bölüm sonu şeridi açık')} value={health.chapterCreditEnabledCount} hint={txa('Ayrıcalığı kullanan ekip.')} />
              <HealthRow label={txa('30 günde özel bildirim')} value={health.specialNotificationCount30d} hint={txa('Ekiplerin takipçilerine gönderdiği.')} />
              <HealthRow label={txa('Özel adres kullanan')} value={health.activeVanityCount} hint={txa('Özel fansub adresi olan ekip.')} />
            </ul>
          </Panel>
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Activity className="size-3.5" />{txa('Veri {v1} üretildi.', { v1: formatRelativeAge(dashboard.generatedAt) })}</p>

      <AdminConfirmDialog request={confirm} busy={confirmBusy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm() }} />
    </section>
  )
}
