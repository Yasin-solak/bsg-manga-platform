import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BarChart3, ImagePlus, Loader2, Pencil, Sparkles, Sticker, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildFansubSupporterEmojiToken, buildFansubSupporterStickerToken } from '@/lib/fansubSupporterAssetTokens'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import {
  archiveFansubSupporterAsset,
  buildFansubSupporterAssetCreatePayload,
  createFansubSupporterAsset,
  editFansubSupporterAssetPresentation,
  getFansubManageSupporterAssets,
  getFansubSupporterAssetUsage,
  reorderFansubSupporterAssets,
  type FansubManageSupporterAssetsPayload,
  type FansubSupporterAssetCatalogItem,
  type FansubSupporterAssetKind,
  type FansubSupporterAssetUsageItem,
} from '@/services/fansubSupporterAssetService'
import { uploadFansubSupporterAsset } from '@/services/storageService'
import { toast } from '@/services/toastService'
import { cn } from '@/lib/utils'
import FansubSupporterAssetMedia from '@/components/community/FansubSupporterAssetMedia'
import FansubIdentityTagManagementPanel from '@/components/fansub/FansubIdentityTagManagementPanel'
import FansubSupporterAssetEditorDialog from './FansubSupporterAssetEditorDialog'
import { ChartBar, Fire, Smiley, Sticker as StickerIcon } from '@phosphor-icons/react'
import { StudioStatStrip } from './StudioStatStrip'
import type { FansubSupporterAssetPresentation } from '@/lib/fansubSupporterAssetPresentation'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubYonetSupporterAssetsTabProps = {
  fansubId: string
  boostSnapshot: FansubBoostSnapshot | null
}

type SupporterAssetSection = FansubSupporterAssetKind | 'identity-tag'

type EditorSubmitValue = {
  shortcode: string
  label: string
  file?: File
  presentation: FansubSupporterAssetPresentation
}

function SupporterAssetTile({
  asset,
  kind,
  uses,
  disabled,
  isBusy,
  onEdit,
  onDelete,
  onMove,
}: {
  asset: FansubSupporterAssetCatalogItem
  kind: FansubSupporterAssetKind
  uses: number
  disabled: boolean
  isBusy: boolean
  onEdit: (asset: FansubSupporterAssetCatalogItem) => void
  onDelete: (asset: FansubSupporterAssetCatalogItem) => void
  onMove: (asset: FansubSupporterAssetCatalogItem, direction: -1 | 1) => void
}) {
  const tokenPreview = kind === 'emoji'
    ? buildFansubSupporterEmojiToken(asset.shortcode, asset.currentRevisionId)
    : buildFansubSupporterStickerToken(asset.shortcode, asset.currentRevisionId)

  return (
    <div className="rounded-2xl border border-border/70 bg-background/85 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
          <FansubSupporterAssetMedia
            asset={asset}
            className="h-full w-full rounded-none bg-transparent"
            imageClassName={kind === 'emoji' ? 'object-cover' : 'object-contain'}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{asset.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">{tokenPreview}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => onMove(asset, -1)}
                disabled={disabled || isBusy}
                title={txa('Yukarı taşı')}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => onMove(asset, 1)}
                disabled={disabled || isBusy}
                title={txa('Aşağı taşı')}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
              {txa('Rev {v1}', { v1: asset.currentRevisionNumber ?? 1 })}
            </span>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5',
                asset.isUsable
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : asset.isWithinQuota
                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-border/70 bg-muted/20 text-muted-foreground',
              )}
            >
              {asset.isUsable ? txa('Kullanımda') : asset.isWithinQuota ? txa('Limit içinde') : txa('Limit dışı')}
            </span>
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
              {txa('Limit {v1}', { v1: asset.quotaLimit })}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-chart-1/25 bg-chart-1/10 px-2 py-0.5 text-chart-1">
              <BarChart3 className="h-3 w-3" />
              {txa('{v1} kullanım', { v1: uses.toLocaleString(intlLocale()) })}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {txa('Eski kullanimlar kendi revision gorunumunu korur.')}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-3 text-[11px]"
            onClick={() => onEdit(asset)}
            disabled={disabled || isBusy}
          >
            {isBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Pencil className="mr-1 h-3.5 w-3.5" />}
            {txa('Duzenle')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-3 text-[11px] text-destructive hover:text-destructive"
            onClick={() => onDelete(asset)}
            disabled={disabled || isBusy}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {txa('Sil')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SupporterAssetKindSection({
  kind,
  title,
  summary,
  limit,
  isUnlocked,
  items,
  actionAssetId,
  getUses,
  onCreate,
  onEdit,
  onDelete,
  onMove,
}: {
  kind: FansubSupporterAssetKind
  title: string
  summary: string
  limit: number
  isUnlocked: boolean
  items: FansubSupporterAssetCatalogItem[]
  actionAssetId: string | null
  getUses: (asset: FansubSupporterAssetCatalogItem) => number
  onCreate: () => void
  onEdit: (asset: FansubSupporterAssetCatalogItem) => void
  onDelete: (asset: FansubSupporterAssetCatalogItem) => void
  onMove: (asset: FansubSupporterAssetCatalogItem, direction: -1 | 1) => void
}) {
  const icon = kind === 'emoji' ? <Sparkles className="h-4 w-4" /> : <Sticker className="h-4 w-4" />
  const liveCount = items.filter((item) => item.isUsable).length
  const overQuotaCount = items.filter((item) => !item.isWithinQuota).length

  return (
    <div className="space-y-4" data-testid="fansub-supporter-assets-tab">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-[20px] border-border/70 bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {icon}
                  {title}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{summary}</p>
              </div>
              <Button type="button" size="sm" className="rounded-full px-4" onClick={onCreate} disabled={!isUnlocked}>
                <ImagePlus className="mr-1.5 h-4 w-4" />
                {txa('Yeni')}{' '}{kind === 'emoji' ? 'emoji' : txa('çıkartma')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Limit')}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{limit}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Kullanımda')}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{liveCount}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Limit dışı')}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{overQuotaCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[20px] border-border/70 bg-card/60">
          <CardContent className="space-y-2 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{txa('Durum')}</p>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm">
              <span>{txa('Yeni kullanım')}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px]',
                  isUnlocked ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted/30 text-muted-foreground',
                )}
              >
                {isUnlocked ? txa('Açık') : txa('Kapalı')}
              </span>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5 text-[11px] text-muted-foreground">
              {txa('Düzenleme yeni bir sürüm açar; eski yorum ve gönderilerdeki kullanımlar değişmez.')}
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5 text-[11px] text-muted-foreground">
              {txa('Silme yalnız yeni kullanımı kapatır; eski kullanımlar görünmeye devam eder.')}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.length > 0 ? items.map((asset) => (
          <SupporterAssetTile
            key={asset.id}
            asset={asset}
            kind={kind}
            uses={getUses(asset)}
            disabled={!isUnlocked}
            isBusy={actionAssetId === asset.id}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
          />
        )) : (
          <div className="col-span-full rounded-2xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
            {txa('Henuz kayit yok.')}
          </div>
        )}
      </div>
    </div>
  )
}

export default function FansubYonetSupporterAssetsTab({
  fansubId,
  boostSnapshot,
}: FansubYonetSupporterAssetsTabProps) {
  const [payload, setPayload] = useState<FansubManageSupporterAssetsPayload | null>(null)
  const [usage, setUsage] = useState<FansubSupporterAssetUsageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeKind, setActiveKind] = useState<SupporterAssetSection>('emoji')
  const [editorKind, setEditorKind] = useState<FansubSupporterAssetKind>('emoji')
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editingAsset, setEditingAsset] = useState<FansubSupporterAssetCatalogItem | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [uploadingKind, setUploadingKind] = useState<FansubSupporterAssetKind | null>(null)
  const [actionAssetId, setActionAssetId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadAssets = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextPayload, usageItems] = await Promise.all([
        getFansubManageSupporterAssets(fansubId),
        // Usage analytics is optional (migration 246); skipped if absent.
        getFansubSupporterAssetUsage(fansubId).catch(() => [] as FansubSupporterAssetUsageItem[]),
      ])
      if (!mountedRef.current) return
      setPayload(nextPayload)
      setUsage(usageItems)
    } catch (error) {
      if (!mountedRef.current) return
      const message = error instanceof Error ? error.message : txa('İfadeler yüklenemedi.')
      setLoadError(message)
      toast.error(message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [fansubId])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  const emojiUnlocked = (payload?.supporterEmojiSlotLimit ?? 0) > 0
  const stickerUnlocked = (payload?.supporterStickerSlotLimit ?? 0) > 0

  const emojiItems = useMemo(
    () => (payload?.items || []).filter((item) => item.assetKind === 'emoji'),
    [payload?.items],
  )
  const stickerItems = useMemo(
    () => (payload?.items || []).filter((item) => item.assetKind === 'sticker'),
    [payload?.items],
  )

  const usageByKey = useMemo(() => {
    const map = new Map<string, number>()
    usage.forEach((item) => {
      map.set(`${item.assetKind}:${item.shortcode.toLowerCase()}`, item.uses)
    })
    return map
  }, [usage])

  const getAssetUses = useCallback(
    (asset: FansubSupporterAssetCatalogItem) => usageByKey.get(`${asset.assetKind}:${asset.shortcode.toLowerCase()}`) ?? 0,
    [usageByKey],
  )

  const totalUses = useMemo(() => usage.reduce((sum, item) => sum + item.uses, 0), [usage])
  const mostUsed = useMemo(
    () => usage.reduce<FansubSupporterAssetUsageItem | null>(
      (top, item) => (item.uses > (top?.uses ?? 0) ? item : top),
      null,
    ),
    [usage],
  )

  const openCreateEditor = (kind: FansubSupporterAssetKind) => {
    setEditorKind(kind)
    setEditorMode('create')
    setEditingAsset(null)
    setEditorOpen(true)
  }

  const openEditEditor = (asset: FansubSupporterAssetCatalogItem) => {
    setEditorKind(asset.assetKind)
    setEditorMode('edit')
    setEditingAsset(asset)
    setEditorOpen(true)
  }

  const handleCreate = async (kind: FansubSupporterAssetKind, value: EditorSubmitValue) => {
    if (!value.file) {
      toast.error(txa('Önce bir dosya seç.'))
      return
    }

    try {
      setUploadingKind(kind)
      const { assetRef, uploadedFile } = await uploadFansubSupporterAsset(value.file, {
        fansubId,
        assetKind: kind,
        shortcode: value.shortcode,
      })
      const input = await buildFansubSupporterAssetCreatePayload({
        fansubId,
        assetKind: kind,
        shortcode: value.shortcode,
        label: value.label,
        file: uploadedFile,
        assetRef,
        presentation: value.presentation,
      })
      await createFansubSupporterAsset(input)
      if (!mountedRef.current) return
      setEditorOpen(false)
      toast.success(kind === 'emoji' ? txa('Emoji eklendi.') : txa('Çıkartma eklendi.'))
      await loadAssets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('İfade eklenemedi.'))
    } finally {
      if (mountedRef.current) setUploadingKind(null)
    }
  }

  const handleEdit = async (asset: FansubSupporterAssetCatalogItem, value: EditorSubmitValue) => {
    try {
      setActionAssetId(asset.id)
      await editFansubSupporterAssetPresentation(
        fansubId,
        asset.id,
        asset.assetKind,
        value.presentation,
      )
      if (!mountedRef.current) return
      setEditorOpen(false)
      toast.success(asset.assetKind === 'emoji' ? txa('Emoji güncellendi.') : txa('Çıkartma güncellendi.'))
      await loadAssets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('İfade güncellenemedi.'))
    } finally {
      if (mountedRef.current) setActionAssetId(null)
    }
  }

  const handleDelete = async (asset: FansubSupporterAssetCatalogItem) => {
    const confirmed = window.confirm(txa('Bu ifade yeni kullanımdan kaldırılacak. Eski yorum ve gönderilerdeki kullanımlar korunur. Devam edilsin mi?'))
    if (!confirmed) return

    try {
      setActionAssetId(asset.id)
      await archiveFansubSupporterAsset(fansubId, asset.id)
      toast.success(asset.assetKind === 'emoji' ? txa('Emoji kaldırıldı.') : txa('Çıkartma kaldırıldı.'))
      await loadAssets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('İfade kaldırılamadı.'))
    } finally {
      if (mountedRef.current) setActionAssetId(null)
    }
  }

  const handleMove = async (asset: FansubSupporterAssetCatalogItem, direction: -1 | 1) => {
    const list = asset.assetKind === 'emoji' ? emojiItems : stickerItems
    const index = list.findIndex((item) => item.id === asset.id)
    const target = list[index + direction]
    if (index === -1 || !target) return

    const reordered = [...list]
    reordered[index] = target
    reordered[index + direction] = asset

    try {
      setActionAssetId(asset.id)
      await reorderFansubSupporterAssets(
        fansubId,
        reordered.map((item, orderIndex) => ({
          id: item.id,
          sortOrder: (orderIndex + 1) * 10,
        })),
      )
      await loadAssets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Sıra güncellenemedi.'))
    } finally {
      if (mountedRef.current) setActionAssetId(null)
    }
  }

  if (loading && !payload) {
    return (
      <div className="rounded-[20px] border border-border/70 bg-card/60 p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {txa('İfadeler yükleniyor…')}
        </div>
      </div>
    )
  }

  if (loadError && !payload) {
    return (
      <div className="space-y-4 rounded-[20px] border border-border/70 bg-card/60 p-6">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{txa('İfadeler yüklenemedi')}</p>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" className="rounded-full px-4" onClick={() => void loadAssets()}>
            {txa('Tekrar dene')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <StudioStatStrip
        items={[
          { key: 'emoji', icon: Smiley, tone: 'emerald', label: txa('Emoji'), value: emojiItems.length.toLocaleString(intlLocale()), sub: txa('{v1} kullanımda', { v1: emojiItems.filter((item) => item.isUsable).length }) },
          { key: 'sticker', icon: StickerIcon, tone: 'violet', label: txa('Çıkartma'), value: stickerItems.length.toLocaleString(intlLocale()), sub: txa('{v1} kullanımda', { v1: stickerItems.filter((item) => item.isUsable).length }) },
          { key: 'uses', icon: ChartBar, tone: 'amber', label: txa('Toplam kullanım'), value: totalUses.toLocaleString(intlLocale()), sub: txa('yorum ve gönderilerde') },
          { key: 'top', icon: Fire, tone: 'sky', label: txa('En çok kullanılan'), value: mostUsed ? `:${mostUsed.shortcode}:` : '—', sub: mostUsed ? txa('{v1} kullanım', { v1: mostUsed.uses.toLocaleString(intlLocale()) }) : txa('Henüz kullanım yok') },
        ]}
      />

      {loadError ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {txa('Son yenileme tamamlanamadı; kayıtlı veriler gösteriliyor.')}
        </div>
      ) : null}

      <Tabs value={activeKind} onValueChange={(value) => setActiveKind(value as SupporterAssetSection)} className="space-y-4">
        <TabsList className="h-auto rounded-full p-1">
          <TabsTrigger value="emoji" className="rounded-full px-4">{txa('Emoji')}</TabsTrigger>
          <TabsTrigger value="sticker" className="rounded-full px-4">{txa('Çıkartma')}</TabsTrigger>
          <TabsTrigger value="identity-tag" className="rounded-full px-4">{txa('Fansub etiketi')}</TabsTrigger>
        </TabsList>

        <TabsContent value="emoji" className="mt-0">
          <SupporterAssetKindSection
            kind="emoji"
            title={txa('Emoji seti')}
            summary={txa('Destekçilerin yorum ve toplulukta kullanır.')}
            limit={payload?.supporterEmojiSlotLimit ?? 0}
            isUnlocked={emojiUnlocked}
            items={emojiItems}
            actionAssetId={actionAssetId}
            getUses={getAssetUses}
            onCreate={() => openCreateEditor('emoji')}
            onEdit={(asset) => openEditEditor(asset)}
            onDelete={(asset) => void handleDelete(asset)}
            onMove={(asset, direction) => void handleMove(asset, direction)}
          />
        </TabsContent>

        <TabsContent value="sticker" className="mt-0">
          <SupporterAssetKindSection
            kind="sticker"
            title={txa('Çıkartma seti')}
            summary={txa('Destekçilerin yorumlarda büyük ifade olarak kullanır.')}
            limit={payload?.supporterStickerSlotLimit ?? 0}
            isUnlocked={stickerUnlocked}
            items={stickerItems}
            actionAssetId={actionAssetId}
            getUses={getAssetUses}
            onCreate={() => openCreateEditor('sticker')}
            onEdit={(asset) => openEditEditor(asset)}
            onDelete={(asset) => void handleDelete(asset)}
            onMove={(asset, direction) => void handleMove(asset, direction)}
          />
        </TabsContent>

        <TabsContent value="identity-tag" className="mt-0">
          <FansubIdentityTagManagementPanel
            fansubId={fansubId}
            boostSnapshot={boostSnapshot}
            compact
          />
        </TabsContent>
      </Tabs>

      <FansubSupporterAssetEditorDialog
        open={editorOpen}
        kind={editorKind}
        mode={editorMode}
        asset={editingAsset}
        submitting={uploadingKind === editorKind || (editingAsset != null && actionAssetId === editingAsset.id)}
        onOpenChange={(nextOpen) => {
          setEditorOpen(nextOpen)
          if (!nextOpen) {
            setEditingAsset(null)
            setEditorMode('create')
          }
        }}
        onSubmit={(value) => {
          if (editorMode === 'edit' && editingAsset) {
            void handleEdit(editingAsset, value)
            return
          }
          void handleCreate(editorKind, value)
        }}
      />
    </div>
  )
}
