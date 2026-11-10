import { Trophy } from 'lucide-react'
import { Link } from '@/i18n/router'
import type { CurrentUser } from '@/contexts/AuthContext'
import AccountSecurityPanel from '@/components/layout/AccountSecurityPanel'
import { AvatarFrame, FRAME_TYPES } from '@/components/common/AvatarFrame'
import RedeemCodeActivationPanel from '@components/common/RedeemCodeActivationPanel'
import UserRewardTasksPanel from '@components/common/UserRewardTasksPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { buildPublicChapterPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
import type {
  AdminFansubWallet,
  FansubBalanceRow,
  PersonalOwnedItemRow,
  QuickPanelKey,
  ReadingHistoryRow,
} from './appSidebarUtils'
import {
  formatDateTime,
  formatRef,
  getBackgroundPreview,
  getPatternPreview,
  isVideoAsset,
  resolveAssetUrl,
} from './appSidebarUtils'
import { txa } from '@/i18n/activeLocale'

type AppSidebarQuickPanelsProps = {
  desktopDesign?: boolean
  activeQuickPanel: QuickPanelKey | null
  adminFansubs: AdminFansubWallet[]
  applyBackground: (identifier: string) => Promise<void> | void
  applyFrame: (identifier: string) => Promise<void> | void
  balanceError: string | null
  balanceLoading: boolean
  balanceRows: FansubBalanceRow[]
  currentUser: CurrentUser | null
  displayedStones: number
  fansubInventoryCount: number
  historyError: string | null
  historyLoading: boolean
  historyRows: ReadingHistoryRow[]
  inventoryError: string | null
  inventoryLoading: boolean
  isCoinCodeActivationEnabled: boolean
  isUserTasksEnabled: boolean
  loadInventory: () => Promise<void>
  ownedBadges: string[]
  personalInventoryCount: number
  personalOwnedRows: PersonalOwnedItemRow[]
  resolvedBackgroundRows: ResolvedInventoryItem[]
  resolvedFrameRows: ResolvedInventoryItem[]
  resolvedPatternRows: ResolvedInventoryItem[]
  roleLabel: string
  selectedBackgroundIdentifier: string | null
  selectedFrameIdentifier: string
  setActiveQuickPanel: (panel: QuickPanelKey | null) => void
  updateCurrentUserStones: (stones: number) => void
  updateFansubBalance: (fansubId: string, balance: number) => void
}

export function AppSidebarQuickPanels({
  desktopDesign = false,
  activeQuickPanel,
  adminFansubs,
  applyBackground,
  applyFrame,
  balanceError,
  balanceLoading,
  balanceRows,
  currentUser,
  displayedStones,
  fansubInventoryCount,
  historyError,
  historyLoading,
  historyRows,
  inventoryError,
  inventoryLoading,
  isCoinCodeActivationEnabled,
  isUserTasksEnabled,
  loadInventory,
  ownedBadges,
  personalInventoryCount,
  personalOwnedRows,
  resolvedBackgroundRows,
  resolvedFrameRows,
  resolvedPatternRows,
  roleLabel,
  selectedBackgroundIdentifier,
  selectedFrameIdentifier,
  setActiveQuickPanel,
  updateCurrentUserStones,
  updateFansubBalance,
}: AppSidebarQuickPanelsProps) {
  return (
    <>
      <QuickPanelDialog
        open={activeQuickPanel === 'inventory'}
        onOpenChange={(open) => {
          if (!open) setActiveQuickPanel(null)
        }}
        title={txa('Envanter Merkezi')}
        size="large"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={txa('Kişisel')} value={personalInventoryCount} />
            <StatCard label={txa('Fansub')} value={fansubInventoryCount} />
            <StatCard label={txa('Bakiye')} value={displayedStones.toLocaleString()} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadInventory()}>{txa('Yenile')}</Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/profil/${encodeURIComponent(currentUser?.username || '')}`} onClick={() => setActiveQuickPanel(null)}>
                {txa('Profilde Yönet')}
              </Link>
            </Button>
          </div>
          {inventoryLoading ? <p className="py-8 text-center text-sm text-muted-foreground">{txa('Yukleniyor...')}</p>
            : inventoryError ? <p className="py-4 text-center text-sm text-destructive">{inventoryError}</p>
              : (
                <div className="space-y-6">
                  <InventorySection title={txa('Çerçeveler ({v1})', { v1: resolvedFrameRows.length })}>
                    {resolvedFrameRows.length === 0 ? <p className="text-sm text-muted-foreground">{txa('Kayıt yok.')}</p> : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {resolvedFrameRows.map((row) => {
                          const active = selectedFrameIdentifier === row.identifier
                          const frameType = FRAME_TYPES.has(row.identifier as never) ? row.identifier : 'default'
                          return (
                            <div key={`f-${row.identifier}`} className={cn('flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors', active ? 'border-primary bg-primary/5' : 'border-border')}>
                              <AvatarFrame
                                src={currentUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=user'}
                                alt={row.name}
                                frameType={frameType}
                                size={54}
                                animated={!row.customAssetUrl}
                                customOverlayUrl={resolveAssetUrl(row.customAssetUrl)}
                              />
                              <span className="text-center text-xs font-medium">{row.name}</span>
                              <Button variant={active ? 'secondary' : 'default'} size="sm" className="h-7 w-full text-xs" disabled={active} onClick={() => void applyFrame(row.identifier)}>
                                {active ? txa('Aktif') : txa('Aktif Et')}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </InventorySection>
                  <InventorySection title={txa('Arka Planlar ({v1})', { v1: resolvedBackgroundRows.length })}>
                    {resolvedBackgroundRows.length === 0 ? <p className="text-sm text-muted-foreground">{txa('Kayıt yok.')}</p> : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {resolvedBackgroundRows.map((row) => {
                          const active = selectedBackgroundIdentifier === row.identifier
                          return (
                            <div key={`bg-${row.identifier}`} className={cn('flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors', active ? 'border-primary bg-primary/5' : 'border-border')}>
                              <div className="h-16 w-full overflow-hidden rounded-md">
                                {isVideoAsset(row.customAssetUrl) ? <video src={resolveAssetUrl(row.customAssetUrl)} autoPlay loop muted playsInline className="h-full w-full object-cover" />
                                  : row.customAssetUrl ? <img loading="lazy" decoding="async" src={resolveAssetUrl(row.customAssetUrl)} alt={row.name} className="h-full w-full object-cover" />
                                    : <div className="h-full w-full" style={{ background: getBackgroundPreview(row.identifier) }} />}
                              </div>
                              <span className="text-center text-xs font-medium">{row.name}</span>
                              <Button variant={active ? 'secondary' : 'default'} size="sm" className="h-7 w-full text-xs" disabled={active} onClick={() => void applyBackground(row.identifier)}>
                                {active ? txa('Aktif') : txa('Aktif Et')}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </InventorySection>
                  <InventorySection title={txa('Desenler ({v1})', { v1: resolvedPatternRows.length })}>
                    {resolvedPatternRows.length === 0 ? <p className="text-sm text-muted-foreground">{txa('Kayıt yok.')}</p> : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {resolvedPatternRows.map((row) => (
                          <div key={`p-${row.identifier}`} className="flex flex-col items-center gap-2 rounded-lg border border-border p-3">
                            <div className="h-16 w-full overflow-hidden rounded-md">
                              {row.customAssetUrl ? <img loading="lazy" decoding="async" src={resolveAssetUrl(row.customAssetUrl)} alt={row.name} className="h-full w-full object-cover" />
                                : <div className="h-full w-full" style={{ background: getPatternPreview(row.identifier) }} />}
                            </div>
                            <span className="text-center text-xs font-medium">{row.name}</span>
                            <span className="text-[10px] text-muted-foreground">{txa('Profilden seçilir')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </InventorySection>
                  <InventorySection title={txa('Rozetler ({v1})', { v1: ownedBadges.length })}>
                    {ownedBadges.length === 0 ? <p className="text-sm text-muted-foreground">{txa('Kayıt yok.')}</p> : (
                      <div className="flex flex-wrap gap-2">
                        {ownedBadges.slice(0, 16).map((item) => <Badge key={`b-${item}`} variant="secondary">{formatRef(item)}</Badge>)}
                      </div>
                    )}
                  </InventorySection>
                </div>
              )}
        </div>
      </QuickPanelDialog>

      <QuickPanelDialog
        open={activeQuickPanel === 'history'}
        onOpenChange={(open) => {
          if (!open) setActiveQuickPanel(null)
        }}
        title={txa('Okuma Geçmişi')}
        size="large"
      >
        <div className="space-y-4">
          {historyLoading ? <p className="py-8 text-center text-sm text-muted-foreground">{txa('Yukleniyor...')}</p>
            : historyError ? <p className="py-4 text-center text-sm text-destructive">{historyError}</p>
              : historyRows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{txa('Henüz okuma geçmişi yok.')}</p>
                : <div className="space-y-2">{historyRows.map((row) => (
                  <Link key={row.id} to={row.mangaId && row.chapterNumber != null ? buildPublicChapterPath({ mangaId: row.mangaId, mangaSlug: row.mangaSlug, mangaTitle: row.mangaTitle, chapterNumber: row.chapterNumber }) : '#'} className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent" onClick={(event) => {
                    if (!row.mangaId || row.chapterNumber == null) {
                      event.preventDefault()
                      return
                    }
                    setActiveQuickPanel(null)
                  }}>
                    <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      {row.coverImage ? <img loading="lazy" decoding="async" src={row.coverImage} alt={row.mangaTitle} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">?</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.mangaTitle}</p>
                      <p className="text-xs text-muted-foreground">{row.chapterNumber != null ? `${row.chapterNumber}. bolum` : txa('Bölüm bilgisi yok')}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(row.readAt)}</p>
                    </div>
                  </Link>
                ))}</div>}
        </div>
      </QuickPanelDialog>

      <QuickPanelDialog
        open={activeQuickPanel === 'balance'}
        onOpenChange={(open) => {
          if (!open) setActiveQuickPanel(null)
        }}
        title={txa('Bakiye Hareketleri')}
        size="large"
      >
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold">{txa('Kişisel ürünler ({v1})', { v1: personalOwnedRows.length })}</h3>
            {personalOwnedRows.length === 0 ? <p className="text-sm text-muted-foreground">{txa('Ürün bulunmuyor.')}</p> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {personalOwnedRows.map((row) => (
                  <div key={`${row.type}-${row.identifier}`} className="flex flex-col items-center gap-2 rounded-lg border border-border p-3">
                    <div className="h-14 w-14 overflow-hidden rounded-md">
                      {row.type === 'frame' ? <AvatarFrame src={currentUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=user'} alt={row.name} frameType={FRAME_TYPES.has(row.identifier as never) ? row.identifier : 'default'} size={48} animated={!row.customAssetUrl} customOverlayUrl={resolveAssetUrl(row.customAssetUrl)} />
                        : isVideoAsset(row.customAssetUrl) ? <video src={resolveAssetUrl(row.customAssetUrl)} autoPlay loop muted playsInline className="h-full w-full object-cover" />
                          : row.customAssetUrl ? <img loading="lazy" decoding="async" src={resolveAssetUrl(row.customAssetUrl)} alt={row.name} className="h-full w-full object-cover" />
                            : row.type === 'background' ? <div className="h-full w-full" style={{ background: getBackgroundPreview(row.identifier) }} />
                              : row.type === 'pattern' ? <div className="h-full w-full" style={{ background: getPatternPreview(row.identifier) }} />
                                : <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">{row.type}</div>}
                    </div>
                    <span className="text-center text-xs font-medium">{row.name}</span>
                    <Badge variant="outline" className="text-[10px]">{row.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
          <Separator />
          <section>
            <h3 className="mb-3 text-sm font-semibold">{txa('Fansub Kasa ({v1})', { v1: balanceRows.length })}</h3>
            {balanceLoading ? <p className="py-4 text-sm text-muted-foreground">{txa('Yukleniyor...')}</p>
              : balanceError ? <p className="py-4 text-sm text-destructive">{balanceError}</p>
                : balanceRows.length === 0 ? <p className="text-sm text-muted-foreground">{txa('Hareket yok.')}</p>
                  : <div className="space-y-2">{balanceRows.map((row) => (
                    <div key={row.id} className="space-y-1 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{row.fansubName}</span>
                        <span className={cn('text-sm font-bold', row.amount >= 0 ? 'text-green-500' : 'text-destructive')}>
                          {row.amount >= 0 ? '+' : ''}{row.amount.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{row.relatedItemName ? txa('Urun: {v1}', { v1: row.relatedItemName }) : row.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</p>
                    </div>
                  ))}</div>}
          </section>
        </div>
      </QuickPanelDialog>

      <QuickPanelDialog
        open={isCoinCodeActivationEnabled && activeQuickPanel === 'redeem'}
        onOpenChange={(open) => {
          if (!open) setActiveQuickPanel(null)
        }}
        title={desktopDesign ? txa('Coin yükle') : txa('Coin Kodu')}
        size="medium"
      >
        <RedeemCodeActivationPanel compact currentUserId={currentUser?.id} fansubOptions={adminFansubs} onUserBalanceChange={updateCurrentUserStones} onFansubBalanceChange={updateFansubBalance} />
      </QuickPanelDialog>

      <QuickPanelDialog
        open={isUserTasksEnabled && activeQuickPanel === 'tasks'}
        onOpenChange={(open) => {
          if (!open) setActiveQuickPanel(null)
        }}
        title={txa('Görevler')}
        size="xl"
        desktopTasks={desktopDesign}
      >
        <UserRewardTasksPanel desktopDesign={desktopDesign} currentUserId={currentUser?.id} onBalanceChange={updateCurrentUserStones} />
      </QuickPanelDialog>

      <QuickPanelDialog
        open={activeQuickPanel === 'security'}
        onOpenChange={(open) => {
          if (!open) setActiveQuickPanel(null)
        }}
        title={txa('Ayarlar')}
        size="medium"
      >
        <AccountSecurityPanel
          open={activeQuickPanel === 'security'}
          username={currentUser?.username}
          roleLabel={roleLabel}
        />
      </QuickPanelDialog>
    </>
  )
}

function QuickPanelDialog({
  open,
  onOpenChange,
  title,
  size = 'medium',
  desktopTasks = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  desktopTasks?: boolean
  size?: 'medium' | 'large' | 'xl'
  children: React.ReactNode
}) {
  const widthClass = size === 'xl' ? 'sm:max-w-5xl' : size === 'large' ? 'sm:max-w-4xl' : 'sm:max-w-2xl'
  // xl (quest panel) fixed height: the modal size does not jump between tabs.
  const scrollClass = size === 'xl' ? 'h-[68vh]' : size === 'medium' ? 'max-h-[72vh]' : 'max-h-[82vh]'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[92vh] p-0', widthClass, desktopTasks && 'dh-quests-modal lg:max-w-[620px]')}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{desktopTasks && <Trophy aria-hidden="true" className="mr-2 inline-block size-5 text-amber-500" />}{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className={cn('px-6 py-4', scrollClass)}>
          {children}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{String(value)}</p>
    </div>
  )
}

function InventorySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}


