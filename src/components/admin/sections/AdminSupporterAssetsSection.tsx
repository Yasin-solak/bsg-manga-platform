import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { History, Image as ImageIcon, RefreshCw, Settings2, Smile, Sticker, UploadCloud, Users, type LucideIcon } from 'lucide-react'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { Button } from '@/components/ui/button'
import { getFansubBoostDowngradeRule } from '@/lib/fansubBoostCapabilityGovernance'
import { cn } from '@/lib/utils'
import {
  getAdminSupporterAssetControlCenter,
  getAdminSupporterAssetDetail,
  getAdminSupporterAssetFansubInventory,
  type AdminSupporterAssetCapabilityPolicyRow,
  type AdminSupporterAssetControlCenter,
  type AdminSupporterAssetDetail,
  type AdminSupporterAssetFansubInventory,
  type AdminSupporterAssetLatestRow,
} from '@/services/adminSupporterAssetControlService'
import { updateAdminBoostCapabilityPolicy } from '@/services/adminBoostControlService'
import { archiveFansubSupporterAsset } from '@/services/fansubSupporterAssetService'
import { toast } from '@/services/toastService'
import {
  ActivityBadge,
  ActorChip,
  CapabilityPlacementCard,
  encodePolicyPlacement,
  formatNumberTr,
  formatRelativeAge,
  LatestAssetCard,
  MetaItem,
} from './supporterAssets/supporterAssetAdminShared'
import { AdminSupporterAssetDetailDialog, AdminSupporterFansubInventoryDialog } from './supporterAssets/AdminSupporterAssetDrilldownDialogs'
import { txa, intlLocale } from '@/i18n/activeLocale'

type AssetTab = 'assets' | 'fansubs' | 'settings'

const TABS: Array<{ id: AssetTab, label: string, icon: LucideIcon }> = [
  { id: 'assets', get label() { return txa('İfadeler') }, icon: Smile },
  { id: 'fansubs', get label() { return txa('Ekipler ve hareketler') }, icon: Users },
  { id: 'settings', get label() { return txa('Seviye ve kota') }, icon: Settings2 },
]

const PLACEMENT_LABEL: Record<string, string> = { get core() { return txa('Herkese açık') }, get 'tier:1'() { return txa('Seviye 1') }, get 'tier:2'() { return txa('Seviye 2') }, get 'tier:3'() { return txa('Seviye 3') }, get disabled() { return txa('Kapalı') } }

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

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

function Panel({ title, meta, children, testId }: { title: string, meta?: string, children: ReactNode, testId?: string }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" data-testid={testId}>
      <header className="border-b border-border/60 px-5 py-3.5">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {meta ? <span className="block text-[12px] text-muted-foreground">{meta}</span> : null}
      </header>
      {children}
    </section>
  )
}

/**
 * Emoji and stickers v2. Fansub teams upload custom emoji / stickers for
 * supporters; the count is limited by boost level. Expressions:
 * latest records (details + removing an inappropriate one). Teams: teams with the most
 * expressions, recent activity, most active uploaders. Level and quota:
 * which level unlocks it (with confirmation), limit per level, consistency.
 */
export default function AdminSupporterAssetsSection() {
  const [dashboard, setDashboard] = useState<AdminSupporterAssetControlCenter | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<AssetTab>('assets')
  const [savingCapabilityKey, setSavingCapabilityKey] = useState<string | null>(null)
  const [assetDetailOpen, setAssetDetailOpen] = useState(false)
  const [assetDetailLoading, setAssetDetailLoading] = useState(false)
  const [assetDetail, setAssetDetail] = useState<AdminSupporterAssetDetail | null>(null)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [fansubInventory, setFansubInventory] = useState<AdminSupporterAssetFansubInventory | null>(null)
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setDashboard(await getAdminSupporterAssetControlCenter())
      setError(null)
    } catch (loadError) {
      setError(toErrorMessage(loadError, txa('Emoji ve çıkartma verisi yüklenemedi.')))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openAssetDetail = useCallback(async (assetId: string) => {
    setInventoryOpen(false)
    setAssetDetailOpen(true)
    setAssetDetailLoading(true)
    setAssetDetail(null)
    try {
      setAssetDetail(await getAdminSupporterAssetDetail(assetId))
    } catch (detailError) {
      toast.error(toErrorMessage(detailError, txa('İfade ayrıntısı yüklenemedi.')))
    } finally {
      setAssetDetailLoading(false)
    }
  }, [])

  const openFansubInventory = useCallback(async (fansubId: string) => {
    setAssetDetailOpen(false)
    setInventoryOpen(true)
    setInventoryLoading(true)
    setFansubInventory(null)
    try {
      setFansubInventory(await getAdminSupporterAssetFansubInventory(fansubId))
    } catch (inventoryError) {
      toast.error(toErrorMessage(inventoryError, txa('Ekip envanteri yüklenemedi.')))
    } finally {
      setInventoryLoading(false)
    }
  }, [])

  const askArchive = (asset: AdminSupporterAssetLatestRow) => {
    setConfirm({
      title: txa('İfadeyi kaldır'),
      subject: `${asset.label} (${asset.shortcode}) · ${asset.fansubName}`,
      consequence: txa('İfade hemen kullanılamaz olur ve seçicilerden kalkar; kayıt denetim için arşivde tutulur. Ekibe bildirim gitmez.'),
      confirmLabel: txa('Kaldır'),
      destructive: true,
      run: async () => {
        try {
          await archiveFansubSupporterAsset(asset.fansubId, asset.assetId)
          toast.success(txa('{v1} kaldırıldı.', { v1: asset.label }))
          setAssetDetailOpen(false)
          await loadData()
        } catch (archiveError) {
          toast.error(toErrorMessage(archiveError, txa('İfade kaldırılamadı.')))
        }
      },
    })
  }

  async function saveCapability(row: AdminSupporterAssetCapabilityPolicyRow, nextValue: string) {
    const [placementType, levelValue] = nextValue.split(':')
    setSavingCapabilityKey(row.capabilityKey)
    try {
      await updateAdminBoostCapabilityPolicy({
        capabilityKey: row.capabilityKey,
        placementType: placementType === 'tier' ? 'tier' : placementType === 'core' ? 'core' : 'disabled',
        tierLevel: placementType === 'tier' ? Number(levelValue || 1) : null,
      })
      await loadData()
      toast.success(`${row.label}: ${(PLACEMENT_LABEL[nextValue] ?? nextValue).toLocaleLowerCase(intlLocale())}.`)
    } catch (policyError) {
      toast.error(toErrorMessage(policyError, txa('Seviye değiştirilemedi.')))
    } finally {
      setSavingCapabilityKey(null)
    }
  }

  const changeCapability = (row: AdminSupporterAssetCapabilityPolicyRow, nextValue: string) => {
    const current = encodePolicyPlacement(row)
    if (nextValue === current) return
    const rank = (value: string) => (value === 'core' ? 0 : value === 'disabled' ? 99 : Number(value.split(':')[1] || 1))
    const stricter = rank(nextValue) > rank(current)
    setConfirm({
      title: `${row.label}: ${(PLACEMENT_LABEL[nextValue] ?? nextValue).toLocaleLowerCase(intlLocale())}`,
      subject: txa('Şu an {v1} · {v2} ekip kullanıyor', { v1: (PLACEMENT_LABEL[current] ?? current).toLocaleLowerCase(intlLocale()), v2: formatNumberTr(row.liveFansubCount) }),
      consequence: stricter
        ? txa('Seviyesi yetmeyen ekipler etkilenir. {v1}', { v1: getFansubBoostDowngradeRule(row.capabilityKey).detail })
        : txa('Daha fazla ekip kullanabilir hale gelir.'),
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
      title={txa('Emoji ve çıkartma')}
      description={txa('Fansubların destekçileri için yüklediği özel ifadeler; sayı takviye seviyesine göre sınırlı.')}
      actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={loading} onClick={() => { void loadData() }}><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{txa('Yenile')}</Button>}
    />
  )

  if (!dashboard) {
    return (
      <section className="flex flex-col gap-4" data-testid="admin-supporter-assets">
        {header}
        {loading
          ? <div className="flex flex-col gap-3">{[0, 1, 2].map((index) => <div key={index} className="h-24 animate-pulse rounded-[20px] bg-muted/40" />)}</div>
          : <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error ?? txa('Veri alınamadı.') })}</p>}
      </section>
    )
  }

  const { overview, health } = dashboard
  const visibleAssets = dashboard.latestAssets.filter((asset) => !asset.isArchived)

  return (
    <section className="flex flex-col gap-4" data-testid="admin-supporter-assets">
      {header}

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('İfade özeti')} data-testid="supporter-assets-strip">
        <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          <StripCell icon={ImageIcon} tone="bg-primary/10 text-primary" label={txa('Toplam ifade')} value={formatNumberTr(overview.totalAssetCount)} hint={txa('{v1} ekip · {v2} kullanılabilir', { v1: formatNumberTr(overview.fansubCountWithAssets), v2: formatNumberTr(overview.usableAssetCount) })} />
          <StripCell icon={Smile} tone="bg-amber-500/10 text-amber-500" label={txa('Emoji')} value={formatNumberTr(overview.totalEmojiCount)} hint={txa('Mesaj ve yorumlarda')} />
          <StripCell icon={Sticker} tone="bg-violet-500/10 text-violet-500" label={txa('Çıkartma')} value={formatNumberTr(overview.totalStickerCount)} hint={txa('{v1} düzenlenmiş', { v1: formatNumberTr(overview.revisedAssetCount) })} />
          <StripCell icon={UploadCloud} tone="bg-sky-500/10 text-sky-500" label={txa('30 günde')} value={formatNumberTr(overview.uploadCount30d)} hint={txa('yükleme · {v1} düzenleme', { v1: formatNumberTr(overview.editCount30d) })} />
        </div>
      </section>

      <div className="inline-flex self-start rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Emoji ve çıkartma bölümleri')}>
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} data-testid={`supporter-assets-tab-${item.id}`} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', tab === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <item.icon className="size-3.5" />{item.label}
          </button>
        ))}
      </div>

      {tab === 'assets' ? (
        <Panel title={txa('Son ifadeler')} meta={txa('Ayrıntı için tıkla; uygunsuz bir ifadeyi ayrıntı penceresinden kaldırabilirsin.')} testId="supporter-assets-latest">
          {visibleAssets.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">{txa('Henüz yüklenmiş ifade yok.')}</p>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleAssets.map((asset) => <LatestAssetCard key={asset.assetId} asset={asset} onOpen={(assetId) => { void openAssetDetail(assetId) }} />)}
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'fansubs' ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Panel title={txa('Ekipler')} meta={txa('En çok ifadesi olan ekipler; envanter için tıkla.')} testId="supporter-assets-fansubs">
            {dashboard.topFansubs.length === 0 ? <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">{txa('İfade yükleyen ekip yok.')}</p> : (
              <ul className="divide-y divide-border/50">
                {dashboard.topFansubs.map((row) => (
                  <li key={row.fansubId}>
                    <button type="button" onClick={() => { void openFansubInventory(row.fansubId) }} className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/40">
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold">{row.name}</span>
                          <span className="shrink-0 rounded-md bg-violet-500/12 px-1.5 py-px text-[10.5px] font-bold text-violet-700 dark:text-violet-300">{row.tierLevel === 0 ? txa('Temel') : `Seviye ${row.tierLevel}`}</span>
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">{txa('{v1} emoji · {v2} çıkartma', { v1: formatNumberTr(row.emojiCount), v2: formatNumberTr(row.stickerCount) })}{row.archivedAssetCount ? txa(' · {v1} arşivde', { v1: formatNumberTr(row.archivedAssetCount) }) : ''} · {txa('son {v1}', { v1: formatRelativeAge(row.lastActivityAt || row.lastAssetAt) })}</span>
                      </span>
                      <span className="shrink-0 text-right text-[12px] tabular-nums"><b className="text-[13px]">{formatNumberTr(row.usableAssetCount)}</b> <span className="text-muted-foreground">{txa('kullanılabilir')}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title={txa('Son hareketler')} testId="supporter-assets-activity">
              {dashboard.recentActivity.length === 0 ? <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">{txa('Hareket yok.')}</p> : (
                <ul className="max-h-[360px] divide-y divide-border/50 overflow-y-auto">
                  {dashboard.recentActivity.slice(0, 20).map((row) => (
                    <li key={`${row.eventType}-${row.assetId}-${row.occurredAt || 'none'}`}>
                      <button type="button" onClick={() => { void openAssetDetail(row.assetId) }} className="flex w-full items-center gap-2 px-5 py-2 text-left transition-colors hover:bg-muted/40">
                        <ActivityBadge row={row} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px]"><b>{row.label || row.shortcode}</b> <span className="text-muted-foreground">· {row.fansubName}</span></span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelativeAge(row.occurredAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={txa('En aktif yükleyenler')} meta={txa('Son 30 gün')}>
              {dashboard.topUploaders.length === 0 ? <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">{txa('Son 30 günde yükleme yok.')}</p> : (
                <ul className="divide-y divide-border/50">
                  {dashboard.topUploaders.map((row) => (
                    <li key={row.user.userId} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="min-w-0 flex-1"><ActorChip actor={row.user} compact /></span>
                      <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{txa('{v1} yükleme · {v2} düzenleme', { v1: formatNumberTr(row.uploadCount30d), v2: formatNumberTr(row.editCount30d) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title={txa('Hangi seviyede açılır')} meta={txa('Değişiklik etkisini soran pencereden geçer.')} testId="supporter-assets-placement">
              <div className="space-y-3 p-4">
                {dashboard.capabilityPolicies.map((row) => (
                  <CapabilityPlacementCard key={row.capabilityKey} row={row} saving={savingCapabilityKey === row.capabilityKey} onChange={changeCapability} />
                ))}
              </div>
            </Panel>
            <Panel title={txa('Seviye başına sınır')} meta={txa('Seçici ve yükleme aynı sınırı kullanır.')} testId="supporter-assets-quota">
              <dl className="grid grid-cols-3 gap-px bg-border/50 text-[12.5px] [&>*]:bg-card">
                <dt className="px-4 py-2 font-semibold text-muted-foreground">{txa('Seviye')}</dt>
                <dt className="px-4 py-2 font-semibold text-muted-foreground">{txa('Emoji')}</dt>
                <dt className="px-4 py-2 font-semibold text-muted-foreground">{txa('Çıkartma')}</dt>
                {dashboard.tierQuotas.map((row) => (
                  <div key={row.tierLevel} className="contents">
                    <dd className="bg-card px-4 py-2 font-semibold">{row.tierLevel === 0 ? txa('Temel') : `Seviye ${row.tierLevel}`}</dd>
                    <dd className="bg-card px-4 py-2 tabular-nums">{formatNumberTr(row.emojiLimit)}</dd>
                    <dd className="bg-card px-4 py-2 tabular-nums">{formatNumberTr(row.stickerLimit)}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title={txa('Tutarlılık')} testId="supporter-assets-health">
              <ul className="divide-y divide-border/50 text-[12.5px]">
                {([
                  [txa('Sınır dışında kalan'), health.quotaOutsideAssetCount, txa('Ekibin seviyesi düşünce sınırı aşan ifadeler; yeni kullanımları kapalı.')],
                  [txa('Pasif'), health.inactiveAssetCount, txa('Kullanılmayan ama arşivlenmemiş kayıtlar.')],
                  [txa('Arşivde'), health.archivedAssetCount, txa('Kaldırılmış, denetim için tutulan kayıtlar.')],
                  [txa('Yükleyeni bilinmeyen'), health.missingActorCount, txa('Kim yüklediği kaydedilmemiş eski kayıtlar.')],
                  [txa('Sürüm kaydı eksik'), health.missingRevisionCount, txa('Normalde 0 olmalı.')],
                ] as const).map(([label, value, hint]) => (
                  <li key={label} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="block truncate text-[11.5px] text-muted-foreground">{hint}</span></span>
                    <span className={cn('rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums', value > 0 && label !== txa('Arşivde') ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>{formatNumberTr(value)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={txa('Depolama')}>
              <div className="space-y-2 p-4">
                <MetaItem label={txa('Yükleme yolu')} value={dashboard.transport.uploadPath} />
                <MetaItem label={txa('Kayıt biçimi')} value={dashboard.transport.assetRefScheme} />
                <MetaItem label={txa('Depo')} value={dashboard.transport.bucket} />
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><History className="size-3.5" />{txa('Veri {v1} üretildi.', { v1: formatRelativeAge(dashboard.generatedAt) })}</p>

      <AdminSupporterAssetDetailDialog
        open={assetDetailOpen}
        loading={assetDetailLoading}
        detail={assetDetail}
        onOpenChange={setAssetDetailOpen}
        onOpenFansubInventory={(fansubId) => { void openFansubInventory(fansubId) }}
        onArchive={askArchive}
      />
      <AdminSupporterFansubInventoryDialog
        open={inventoryOpen}
        loading={inventoryLoading}
        inventory={fansubInventory}
        onOpenChange={setInventoryOpen}
        onOpenAsset={(assetId) => { void openAssetDetail(assetId) }}
      />
      <AdminConfirmDialog request={confirm} busy={confirmBusy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm() }} />
    </section>
  )
}
