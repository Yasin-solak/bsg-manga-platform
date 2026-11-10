import { useState } from 'react'
import {
  BookOpen,
  Coins,
  History,
  RefreshCw,
  ShieldCheck,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { useFansubManagementState } from './useFansubManagementState'
import {
  INVENTORY_PER_PAGE,
  MANGAS_PER_PAGE,
  MEMBERS_PER_PAGE,
  TRANSACTIONS_PER_PAGE,
  compactNumber,
  dateText,
  pageCount,
  relativeDateText,
  type DetailTab,
} from './fansubManagementUtils'
import { FansubOverviewTab } from './FansubOverviewTab'
import { FansubMembersTab } from './FansubMembersTab'
import { FansubMangasTab } from './FansubMangasTab'
import { FansubEconomyTab } from './FansubEconomyTab'
import { AdminFansubModerationTab } from './AdminFansubModerationTab'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubManagementStateShape = ReturnType<typeof useFansubManagementState>

type AdminFansubDetailModalProps = Pick<
  FansubManagementStateShape,
  | 'selectedFansub'
  | 'tab'
  | 'stats'
  | 'statsLoading'
  | 'members'
  | 'memberTotal'
  | 'memberLoading'
  | 'memberError'
  | 'memberSearchInput'
  | 'setMemberSearchInput'
  | 'memberState'
  | 'setMemberState'
  | 'memberPage'
  | 'setMemberPage'
  | 'memberDrafts'
  | 'memberBusyId'
  | 'saveMember'
  | 'updateMemberDraftRole'
  | 'updateMemberDraftTag'
  | 'mangas'
  | 'mangaTotal'
  | 'mangaLoading'
  | 'mangaError'
  | 'mangaSearchInput'
  | 'setMangaSearchInput'
  | 'mangaStatus'
  | 'setMangaStatus'
  | 'mangaPage'
  | 'setMangaPage'
  | 'mangaBusyId'
  | 'toggleMangaActive'
  | 'inventory'
  | 'inventoryTotal'
  | 'inventoryLoading'
  | 'inventoryError'
  | 'inventorySearchInput'
  | 'setInventorySearchInput'
  | 'inventoryPage'
  | 'setInventoryPage'
  | 'transactions'
  | 'transactionTotal'
  | 'transactionLoading'
  | 'transactionError'
  | 'transactionSearchInput'
  | 'setTransactionSearchInput'
  | 'transactionType'
  | 'setTransactionType'
  | 'transactionPage'
  | 'setTransactionPage'
> & {
  isOpen: boolean
  refreshing?: boolean
  onClose: () => void
  onRefresh: () => Promise<void>
  onTabChange: (tab: DetailTab) => void
}

const TAB_ITEMS = [
  { value: 'overview', get label() { return txa('Genel') }, icon: ShieldCheck },
  { value: 'members', get label() { return txa('Üyeler') }, icon: Users },
  { value: 'mangas', get label() { return txa('Seriler') }, icon: BookOpen },
  { value: 'economy', get label() { return txa('Ekonomi') }, icon: Coins },
  { value: 'moderation', get label() { return txa('Yönetim geçmişi') }, icon: History },
] satisfies Array<{ value: DetailTab; label: string; icon: typeof Users }>

export function AdminFansubDetailModal({
  isOpen,
  refreshing = false,
  onClose,
  onRefresh,
  onTabChange,
  selectedFansub,
  tab,
  stats,
  statsLoading,
  members,
  memberTotal,
  memberLoading,
  memberError,
  memberSearchInput,
  setMemberSearchInput,
  memberState,
  setMemberState,
  memberPage,
  setMemberPage,
  memberDrafts,
  memberBusyId,
  saveMember,
  updateMemberDraftRole,
  updateMemberDraftTag,
  mangas,
  mangaTotal,
  mangaLoading,
  mangaError,
  mangaSearchInput,
  setMangaSearchInput,
  mangaStatus,
  setMangaStatus,
  mangaPage,
  setMangaPage,
  mangaBusyId,
  toggleMangaActive,
  inventory,
  inventoryTotal,
  inventoryLoading,
  inventoryError,
  inventorySearchInput,
  setInventorySearchInput,
  inventoryPage,
  setInventoryPage,
  transactions,
  transactionTotal,
  transactionLoading,
  transactionError,
  transactionSearchInput,
  setTransactionSearchInput,
  transactionType,
  setTransactionType,
  transactionPage,
  setTransactionPage,
}: AdminFansubDetailModalProps) {
  const [moderationRefreshKey, setModerationRefreshKey] = useState(0)

  if (!selectedFansub) return null

  async function handleRefresh() {
    await onRefresh()
    setModerationRefreshKey((current) => current + 1)
  }

  const trustScore = selectedFansub.trust?.score

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(94dvh,56rem)] sm:max-h-[56rem] sm:w-[min(95vw,56rem)] sm:max-w-[56rem] sm:rounded-2xl sm:border"
        data-testid="admin-fansub-detail-modal"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{txa('{v1} detaylı fansub bilgileri', { v1: selectedFansub.name })}</DialogTitle>
          <DialogDescription>{txa('Fansub, üye, manga, ekonomi ve moderasyon detayları.')}</DialogDescription>
        </DialogHeader>

        <div className="border-b border-border bg-card px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">{txa('Detaylı Fansub Bilgileri')}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{txa('Fansubun tüm detaylarını görüntüleyin ve kapsamlı yönetim işlemleri yapın.')}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={refreshing} onClick={() => void handleRefresh()}>
                <RefreshCw className={refreshing ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'} aria-hidden="true" />
                <span className="hidden sm:inline">{txa('Yenile')}</span>
              </Button>
              <Button type="button" size="icon-sm" variant="outline" className="min-h-11 min-w-11" onClick={onClose} aria-label={txa('Detaylı fansub bilgilerini kapat')}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)_13rem] sm:gap-4">
            <img
              loading="lazy"
              decoding="async"
              src={selectedFansub.avatarUrl}
              alt=""
              className="size-16 shrink-0 rounded-full border border-border object-cover shadow-sm sm:size-[4.75rem]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold text-foreground sm:text-2xl">{selectedFansub.name}</h2>
                <Badge variant={selectedFansub.isActive ? 'default' : 'secondary'}>{selectedFansub.isActive ? txa('Aktif') : txa('Pasif')}</Badge>
                {selectedFansub.isVerified === true ? <Badge variant="outline">{txa('Doğrulanmış')}</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">@{selectedFansub.slug}</p>
              <p className="mt-1.5 line-clamp-2 max-w-2xl text-[11px] leading-4 text-muted-foreground">{selectedFansub.description || txa('Fansub açıklaması bulunmuyor.')}</p>
            </div>
            <dl className="col-span-2 grid grid-cols-3 gap-x-3 gap-y-1 border-t border-border pt-2 text-[10px] sm:col-span-1 sm:grid-cols-1 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <CompactDetailRow label={txa('Kuruluş Tarihi')} value={dateText(selectedFansub.createdAt)} />
              <CompactDetailRow label={txa('Son hareket')} value={relativeDateText(selectedFansub.lastActivityAt)} />
              <CompactDetailRow label={txa('Fansub kimliği')} value={selectedFansub.id.slice(0, 8)} title={selectedFansub.id} />
            </dl>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-0 overflow-hidden rounded-lg border border-border sm:grid-cols-6">
            <HeaderMetric icon={ShieldCheck} label={txa('Takviye')} value={selectedFansub.boostLevel == null ? '—' : `Sv. ${selectedFansub.boostLevel}`} />
            <HeaderMetric icon={UsersRound} label={txa('Üyeler')} value={statsLoading ? '…' : compactNumber(stats.active || selectedFansub.memberCount)} />
            <HeaderMetric icon={BookOpen} label={txa('Manga')} value={compactNumber(selectedFansub.mangaCount)} />
            <HeaderMetric icon={Users} label={txa('Takipçiler')} value={compactNumber(selectedFansub.followerCount)} />
            <HeaderMetric icon={Coins} label={txa('Coin bakiyesi')} value={selectedFansub.coinBalance.toLocaleString(intlLocale())} />
            <HeaderMetric icon={ShieldCheck} label={txa('Güven Skoru')} value={trustScore == null ? '—' : `${trustScore}/100`} />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(value) => onTabChange(value as DetailTab)} className="min-h-0 min-w-0 gap-0 overflow-hidden">
          <div className="hide-scrollbar shrink-0 overflow-x-auto border-b border-border bg-card px-2 sm:px-5">
            <TabsList variant="line" className="h-11 min-w-max justify-start gap-0 p-0 group-data-[orientation=horizontal]/tabs:h-11 sm:w-full">
              {TAB_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="h-11 min-h-11 flex-none rounded-none px-3 text-[11px] data-[state=active]:font-semibold data-[state=active]:text-primary sm:flex-1"
                  >
                    <Icon className="size-4" aria-hidden="true" /> {item.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-background p-3 sm:p-4" data-testid="admin-fansub-detail-content">
            <TabsContent value="overview" className="m-0">
              <FansubOverviewTab
                totalMembers={stats.total || selectedFansub.memberCount || 0}
                activeMembers={stats.active || selectedFansub.memberCount || 0}
                leftMembers={stats.left}
                coinBalance={selectedFansub.coinBalance}
                updatedAt={selectedFansub.updatedAt}
                statsLoading={statsLoading}
                fansub={selectedFansub}
              />
            </TabsContent>

            <TabsContent value="members" className="m-0">
              <FansubMembersTab
                searchInput={memberSearchInput}
                onSearchInputChange={setMemberSearchInput}
                memberState={memberState}
                onMemberStateChange={setMemberState}
                total={memberTotal}
                page={memberPage}
                pageTotal={pageCount(memberTotal, MEMBERS_PER_PAGE)}
                loading={memberLoading}
                error={memberError}
                members={members}
                memberDrafts={memberDrafts}
                memberBusyId={memberBusyId}
                canEditMembers={selectedFansub.isActive}
                onDraftRoleChange={updateMemberDraftRole}
                onDraftTagChange={updateMemberDraftTag}
                onSaveMember={(row) => { void saveMember(row) }}
                onPrevPage={() => setMemberPage((current) => Math.max(1, current - 1))}
                onNextPage={() => setMemberPage((current) => Math.min(pageCount(memberTotal, MEMBERS_PER_PAGE), current + 1))}
              />
            </TabsContent>

            <TabsContent value="mangas" className="m-0">
              <FansubMangasTab
                searchInput={mangaSearchInput}
                onSearchInputChange={setMangaSearchInput}
                mangaStatus={mangaStatus}
                onMangaStatusChange={setMangaStatus}
                total={mangaTotal}
                page={mangaPage}
                pageTotal={pageCount(mangaTotal, MANGAS_PER_PAGE)}
                loading={mangaLoading}
                error={mangaError}
                mangas={mangas}
                mangaBusyId={mangaBusyId}
                onToggleMangaActive={(manga) => { void toggleMangaActive(manga) }}
                onPrevPage={() => setMangaPage((current) => Math.max(1, current - 1))}
                onNextPage={() => setMangaPage((current) => Math.min(pageCount(mangaTotal, MANGAS_PER_PAGE), current + 1))}
              />
            </TabsContent>

            <TabsContent value="economy" className="m-0">
              <FansubEconomyTab
                coinBalance={selectedFansub.coinBalance}
                inventoryTotal={inventoryTotal}
                transactionTotal={transactionTotal}
                inventorySearchInput={inventorySearchInput}
                onInventorySearchInputChange={setInventorySearchInput}
                inventoryPage={inventoryPage}
                inventoryPageTotal={pageCount(inventoryTotal, INVENTORY_PER_PAGE)}
                inventoryLoading={inventoryLoading}
                inventoryError={inventoryError}
                inventory={inventory}
                onInventoryPrevPage={() => setInventoryPage((current) => Math.max(1, current - 1))}
                onInventoryNextPage={() => setInventoryPage((current) => Math.min(pageCount(inventoryTotal, INVENTORY_PER_PAGE), current + 1))}
                transactionSearchInput={transactionSearchInput}
                onTransactionSearchInputChange={setTransactionSearchInput}
                transactionType={transactionType}
                onTransactionTypeChange={setTransactionType}
                transactionPage={transactionPage}
                transactionPageTotal={pageCount(transactionTotal, TRANSACTIONS_PER_PAGE)}
                transactionLoading={transactionLoading}
                transactionError={transactionError}
                transactions={transactions}
                onTransactionPrevPage={() => setTransactionPage((current) => Math.max(1, current - 1))}
                onTransactionNextPage={() => setTransactionPage((current) => Math.min(pageCount(transactionTotal, TRANSACTIONS_PER_PAGE), current + 1))}
              />
            </TabsContent>

            <TabsContent value="moderation" className="m-0">
              <AdminFansubModerationTab
                fansubId={selectedFansub.id}
                pendingReviewCount={selectedFansub.pendingReviewCount || 0}
                refreshKey={moderationRefreshKey}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function HeaderMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-r border-border px-2 py-2 [&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:border-b-0 sm:border-b-0 sm:[&:nth-child(3n)]:border-r sm:[&:last-child]:border-r-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] text-muted-foreground">{label}</span>
        <strong className="block truncate text-[13px] tabular-nums text-foreground">{value}</strong>
      </span>
    </div>
  )
}

function CompactDetailRow({
  label,
  value,
  title,
}: {
  label: string
  value: string
  title?: string
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground" title={title}>{value}</dd>
    </div>
  )
}
