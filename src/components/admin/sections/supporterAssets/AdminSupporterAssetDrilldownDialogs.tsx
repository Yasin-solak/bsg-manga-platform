import { useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowUpRight, History, Layers3, Package2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  AdminSupporterAssetDetail,
  AdminSupporterAssetFansubInventory,
  AdminSupporterAssetLatestRow,
} from '@/services/adminSupporterAssetControlService'
import {
  ActivityBadge,
  ActorChip,
  AssetKindLabel,
  EmptyState,
  formatBytes,
  formatDateTimeTr,
  formatNumberTr,
  formatRelativeAge,
  MetaItem,
  MiniPreview,
  tierTone,
} from './supporterAssetAdminShared'
import { txa } from '@/i18n/activeLocale'

function buildStudioHref(fansubId?: string | null) {
  return fansubId ? `/fansub/${fansubId}/yonet` : '/fansublar'
}

function presentationSummary(asset: AdminSupporterAssetLatestRow) {
  return [
    { label: txa('Sığdırma'), value: asset.presentation.fitMode === 'cover' ? txa('Cover') : txa('Contain') },
    { label: txa('Ölçek'), value: asset.presentation.scale.toFixed(2) },
    { label: 'X', value: `${asset.presentation.offsetX}%` },
    { label: 'Y', value: `${asset.presentation.offsetY}%` },
    { label: txa('Rotasyon'), value: `${asset.presentation.rotation}°` },
  ]
}

function statusBadges(asset: AdminSupporterAssetLatestRow) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={tierTone(asset.tierLevel)} className="h-5 px-1.5 text-[10px]">
        {asset.tierLevel === 0 ? txa('Temel') : `Seviye ${asset.tierLevel}`}
      </Badge>
      <Badge variant={asset.assetKind === 'emoji' ? 'secondary' : 'outline'} className="h-5 px-1.5 text-[10px]">
        {asset.assetKind === 'emoji' ? txa('Emoji') : txa('Çıkartma')}
      </Badge>
      {asset.isArchived ? (
        <Badge variant="outline">{txa('Arşivde')}</Badge>
      ) : asset.isUsable ? (
        <Badge variant="default">{txa('Kullanılabilir')}</Badge>
      ) : asset.isWithinQuota ? (
        <Badge variant="secondary">{txa('Sınır içinde')}</Badge>
      ) : (
        <Badge variant="outline">{txa('Sınır dışında')}</Badge>
      )}
      {!asset.isActive && !asset.isArchived ? <Badge variant="outline">{txa('Pasif')}</Badge> : null}
    </div>
  )
}

export function AdminSupporterAssetDetailDialog({
  open,
  loading,
  detail,
  onOpenChange,
  onOpenFansubInventory,
  onArchive,
}: {
  open: boolean
  loading: boolean
  detail: AdminSupporterAssetDetail | null
  onOpenChange: (open: boolean) => void
  onOpenFansubInventory: (fansubId: string) => void
  /** Remove an inappropriate expression (archives it; confirmation is in the parent component). */
  onArchive?: (asset: AdminSupporterAssetLatestRow) => void
}) {
  const asset = detail?.asset ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex max-h-[88vh] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <DialogTitle>{asset?.label || txa('İfade ayrıntısı')}</DialogTitle>
                <DialogDescription>
                  {asset ? `/${asset.fansubSlug || asset.fansubName} · ${asset.shortcode}` : txa('İfade ayrıntısı.')}
                </DialogDescription>
                {asset ? statusBadges(asset) : null}
              </div>
              {asset ? (
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <Button type="button" size="sm" variant="outline" onClick={() => onOpenFansubInventory(asset.fansubId)}>
                    {txa('Envanter')}
                  </Button>
                  <Button asChild type="button" size="sm" variant="outline">
                    <Link to={buildStudioHref(asset.fansubId)} target="_blank" rel="noreferrer">
                      {txa('Stüdyo')}
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  {onArchive && !asset.isArchived ? (
                    <Button type="button" size="sm" variant="destructive" onClick={() => onArchive(asset)} data-testid="supporter-asset-archive">
                      {txa('Kaldır')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-6 px-6 py-5">
              {loading ? (
                <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="h-72 animate-pulse rounded-3xl border border-border/70 bg-muted/30" />
                  <div className="space-y-4">
                    <div className="h-24 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
                    <div className="h-24 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
                    <div className="h-40 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
                  </div>
                </div>
              ) : !asset ? (
                <EmptyState
                  title={txa('İfade ayrıntısı yüklenemedi')}
                  detail={txa('Kayıt bulunamadı ya da yanıt boş geldi.')}
                />
              ) : (
                <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="flex h-72 items-center justify-center overflow-hidden rounded-3xl border border-border/70 bg-muted/10">
                      <MiniPreview asset={asset} className="h-56 w-56 rounded-[2rem]" />
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{txa('Kim yükledi')}</p>
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-[11px] text-muted-foreground">{txa('İlk yükleyen')}</p>
                          <div className="mt-1"><ActorChip actor={asset.createdBy} fallback={txa('Kayıt yok')} /></div>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">{txa('Son düzenleyen')}</p>
                          <div className="mt-1"><ActorChip actor={asset.currentRevisionCreatedBy || asset.updatedBy} fallback={txa('Kayıt yok')} /></div>
                        </div>
                        {asset.deletedAt ? (
                          <div>
                            <p className="text-[11px] text-muted-foreground">{txa('Kaldıran')}</p>
                            <div className="mt-1"><ActorChip actor={asset.deletedBy} fallback={txa('Kayıt yok')} /></div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <MetaItem label={txa('Oluşturuldu')} value={formatDateTimeTr(asset.createdAt)} />
                      <MetaItem label={txa('Son hareket')} value={formatDateTimeTr(asset.updatedAt || asset.currentRevisionCreatedAt)} />
                      <MetaItem label={txa('Dosya')} value={formatBytes(asset.sizeBytes)} />
                      <MetaItem label={txa('Boyut')} value={asset.width && asset.height ? `${asset.width} × ${asset.height}` : '-'} />
                      <MetaItem label={txa('Sınır')} value={asset.quotaRank ? `${asset.quotaRank}/${asset.quotaLimit}` : `-/${asset.quotaLimit}`} />
                      <MetaItem label={txa('Sürüm')} value={`${asset.currentRevisionNumber ?? 1}/${asset.latestRevisionNumber ?? asset.currentRevisionNumber ?? 1}`} />
                    </div>

                    <Tabs defaultValue="genel">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="genel">
                          <Package2 className="h-4 w-4" />
                          {txa('Genel')}
                        </TabsTrigger>
                        <TabsTrigger value="revizyonlar">
                          <History className="h-4 w-4" />
                          {txa('Sürümler')}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="genel" className="mt-4 space-y-4">
                        <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
                          <p className="text-sm font-semibold text-foreground">{txa('Kimlik')}</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <MetaItem label={txa('Kısa kod')} value={asset.shortcode} />
                            <MetaItem label={txa('Tür')} value={asset.assetKind === 'emoji' ? txa('Emoji') : txa('Çıkartma')} />
                            <MetaItem label="MIME" value={asset.mimeType || '-'} />
                            <MetaItem label={txa('Kayıt adresi')} value={asset.assetRef} />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
                          <p className="text-sm font-semibold text-foreground">{txa('Sunum')}</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            {presentationSummary(asset).map((item) => (
                              <MetaItem key={item.label} label={item.label} value={item.value} />
                            ))}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="revizyonlar" className="mt-4">
                        {!detail?.revisions.length ? (
                          <EmptyState
                            title={txa('Sürüm bulunamadı')}
                            detail={txa('Bu ifade için kayıtlı sürüm yok.')}
                          />
                        ) : (
                          <div className="space-y-3">
                            {detail.revisions.map((revision) => (
                              <div key={revision.revisionId} className="rounded-2xl border border-border/70 bg-muted/10 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant={revision.isCurrent ? 'default' : revision.isLegacy ? 'outline' : 'secondary'}>
                                        {txa('Rev {v1}', { v1: revision.revisionNumber })}
                                      </Badge>
                                      {revision.isCurrent ? <Badge variant="secondary">{txa('Guncel')}</Badge> : null}
                                      {revision.isLegacy ? <Badge variant="outline">{txa('İlk')}</Badge> : null}
                                      <AssetKindLabel kind={asset.assetKind} />
                                    </div>
                                    <p className="text-sm font-medium text-foreground">{revision.label}</p>
                                    <p className="text-xs text-muted-foreground">{revision.shortcode}</p>
                                  </div>
                                  <div className="text-right text-xs text-muted-foreground">
                                    <p>{formatDateTimeTr(revision.createdAt)}</p>
                                    <p className="mt-1">{formatBytes(revision.sizeBytes)}</p>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                  <ActorChip actor={revision.createdBy} compact fallback={txa('Bilinmiyor')} />
                                  <div className="flex flex-wrap gap-2">
                                    <MetaItem label={txa('Sığdırma')} value={revision.presentation.fitMode === 'cover' ? txa('Cover') : txa('Contain')} />
                                    <MetaItem label={txa('Ölçek')} value={revision.presentation.scale.toFixed(2)} />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AdminSupporterFansubInventoryDialog({
  open,
  loading,
  inventory,
  onOpenChange,
  onOpenAsset,
}: {
  open: boolean
  loading: boolean
  inventory: AdminSupporterAssetFansubInventory | null
  onOpenChange: (open: boolean) => void
  onOpenAsset: (assetId: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'emoji' | 'sticker' | 'archived'>('all')
  const items = inventory?.items ?? []

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'archived') return items.filter((item) => item.isArchived)
    return items.filter((item) => item.assetKind === filter && !item.isArchived)
  }, [filter, items])

  const fansub = inventory?.fansub ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex max-h-[88vh] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <DialogTitle>{fansub?.name || txa('Fansub envanteri')}</DialogTitle>
                <DialogDescription>
                  {fansub ? `/${fansub.slug} · ${fansub.liveAssetCount} canli ifade` : txa('Ekibin ifadeleri ve son hareketleri.')}
                </DialogDescription>
                {fansub ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={tierTone(fansub.tierLevel)} className="h-5 px-1.5 text-[10px]">
                      {fansub.tierLevel === 0 ? txa('Core') : `S${fansub.tierLevel}`}
                    </Badge>
                    {fansub.latestActor ? <ActorChip actor={fansub.latestActor} compact fallback={txa('Bilinmiyor')} /> : null}
                  </div>
                ) : null}
              </div>

              {fansub ? (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link to={buildStudioHref(fansub.fansubId)} target="_blank" rel="noreferrer">
                    {txa('Fansub Studio')}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-6 px-6 py-5">
              {loading ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="h-20 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
                    ))}
                  </div>
                  <div className="h-80 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
                </div>
              ) : !fansub ? (
                <EmptyState
                  title={txa('Ekip envanteri yüklenemedi')}
                  detail={txa('Bu ekip için kayıt bulunamadı.')}
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <MetaItem label={txa('Toplam')} value={formatNumberTr(fansub.totalAssetCount)} />
                    <MetaItem label={txa('Kullanılabilir')} value={formatNumberTr(fansub.liveAssetCount)} />
                    <MetaItem label={txa('Arşiv')} value={formatNumberTr(fansub.archivedAssetCount)} />
                    <MetaItem label={txa('Emoji / sınır')} value={`${items.filter((item) => item.assetKind === 'emoji' && !item.isArchived).length}/${fansub.emojiLimit}`} />
                    <MetaItem label={txa('Çıkartma / sınır')} value={`${items.filter((item) => item.assetKind === 'sticker' && !item.isArchived).length}/${fansub.stickerLimit}`} />
                  </div>

                  <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="all">
                        <Layers3 className="h-4 w-4" />
                        {txa('Tümü')}
                      </TabsTrigger>
                      <TabsTrigger value="emoji">{txa('Emoji')}</TabsTrigger>
                      <TabsTrigger value="sticker">{txa('Çıkartma')}</TabsTrigger>
                      <TabsTrigger value="archived">{txa('Arşiv')}</TabsTrigger>
                    </TabsList>

                    <TabsContent value={filter} className="mt-4 space-y-4">
                      {!filteredItems.length ? (
                        <EmptyState
                          title={txa('Bu filtrede kayıt yok')}
                          detail={txa('Seçilen ekipte bu görünüme uygun ifade yok.')}
                        />
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-border/70">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/20 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              <tr>
                                <th className="px-4 py-3">{txa('İfade')}</th>
                                <th className="px-4 py-3">{txa('Durum')}</th>
                                <th className="px-4 py-3">{txa('Yükleyen')}</th>
                                <th className="px-4 py-3 text-right">{txa('Son hareket')}</th>
                                <th className="px-4 py-3 text-right">{txa('Aksiyon')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredItems.map((item) => (
                                <tr key={item.assetId} className="border-t border-border/70 align-top">
                                  <td className="px-4 py-3">
                                    <div className="flex items-start gap-3">
                                      <MiniPreview asset={item} className="h-12 w-12 rounded-2xl" />
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground">{item.label}</p>
                                        <p className="truncate text-xs text-muted-foreground">{item.shortcode}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                          <AssetKindLabel kind={item.assetKind} />
                                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                            {txa('Rev {v1}', { v1: item.currentRevisionNumber ?? 1 })}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="space-y-1">
                                      {statusBadges(item)}
                                      <p className="text-xs text-muted-foreground">
                                        {item.quotaRank ? `Sira ${item.quotaRank}/${item.quotaLimit}` : `Limit ${item.quotaLimit}`}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <ActorChip actor={item.currentRevisionCreatedBy || item.createdBy} compact fallback={txa('Kayıt yok')} />
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                                    <p>{formatRelativeAge(item.updatedAt || item.createdAt)}</p>
                                    <p className="mt-1">{formatDateTimeTr(item.updatedAt || item.createdAt)}</p>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Button type="button" size="xs" variant="outline" onClick={() => onOpenAsset(item.assetId)}>
                                      {txa('Incele')}
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
                        <p className="text-sm font-semibold text-foreground">{txa('Son ekip hareketleri')}</p>
                        {!inventory?.recentActivity.length ? (
                          <p className="mt-2 text-sm text-muted-foreground">{txa('Kayıtlı hareket yok.')}</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {inventory.recentActivity.slice(0, 8).map((row) => (
                              <div key={`${row.eventType}-${row.assetId}-${row.occurredAt || 'none'}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <ActivityBadge row={row} />
                                    <p className="truncate text-sm font-medium text-foreground">{row.label || row.shortcode}</p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                    <ActorChip actor={row.actor} compact fallback={txa('Bilinmiyor')} />
                                    <span>{formatDateTimeTr(row.occurredAt)}</span>
                                  </div>
                                </div>
                                <Button type="button" size="xs" variant="ghost" onClick={() => onOpenAsset(row.assetId)}>
                                  {txa('Detay')}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
