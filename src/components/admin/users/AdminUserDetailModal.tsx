import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, LoaderCircle, RefreshCw, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getAdminUserDetail,
  getAdminUserDetailInsights,
  type AdminManagedUser,
  type AdminUserDetail,
  type AdminUserDetailInsights,
} from '@/services/adminUserService'
import { getAdminUserProgression, type AdminUserProgression } from '@/services/userProgressionService'
import { toast } from '@/services/toastService'
import { cn } from '@/lib/utils'
import { AdminUserDetailHeader } from './AdminUserDetailHeader'
import { AdminUserDetailOverview } from './AdminUserDetailOverview'
import { AdminUserDetailOwnerships } from './AdminUserDetailOwnerships'
import {
  AdminUserCommentsTab,
  AdminUserFansubTab,
  AdminUserReadingTab,
} from './AdminUserDetailDataTabs'
import { AdminUserActivityTab, AdminUserModerationTab } from './AdminUserDetailInsightsTabs'
import { ADMIN_USER_DETAIL_TABS, type AdminUserDetailTab } from './adminUserDetailTabs'
import { getUserDisplayName, getUserTrust } from './adminUsersUtils'
import { toErrorText } from './adminUserDetailUtils'
import { txa } from '@/i18n/activeLocale'

interface AdminUserDetailModalProps {
  isOpen: boolean
  user: AdminManagedUser | null
  currentUserId?: string
  isBusy?: boolean
  onClose: () => void
  onToggleBan?: (user: AdminManagedUser) => void
  initialTab?: AdminUserDetailTab
}

function AdminUserDetailModal({
  isOpen,
  user,
  currentUserId,
  isBusy = false,
  onClose,
  onToggleBan,
  initialTab = 'profil',
}: AdminUserDetailModalProps) {
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [insights, setInsights] = useState<AdminUserDetailInsights | null>(null)
  const [insightsUnavailable, setInsightsUnavailable] = useState(false)
  const [insightsErrorText, setInsightsErrorText] = useState<string | null>(null)
  const [progression, setProgression] = useState<AdminUserProgression | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AdminUserDetailTab>(initialTab)

  const loadUserDetail = useCallback(async (userId: string, forceRefresh = false) => {
    if (!userId.trim()) return
    setLoading(!forceRefresh)
    setErrorText(null)
    try {
      const [detailResult, progressionResult, insightsResult] = await Promise.all([
        getAdminUserDetail(userId, { forceRefresh }),
        getAdminUserProgression(userId).catch(() => null),
        getAdminUserDetailInsights(userId, { forceRefresh })
          .then((value) => ({ value, error: null as string | null }))
          .catch((error) => ({
            value: null,
            error: toErrorText(error, txa('Aktivite ve moderasyon detayları yüklenemedi.')),
          })),
      ])
      setDetail(detailResult)
      setProgression(progressionResult)
      setInsights(insightsResult.value)
      setInsightsUnavailable(!insightsResult.value && !insightsResult.error)
      setInsightsErrorText(insightsResult.error)
    } catch (error) {
      const message = toErrorText(error, txa('Kullanıcı detayları yüklenemedi.'))
      setErrorText(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !user) {
      setDetail(null)
      setProgression(null)
      setInsights(null)
      setInsightsUnavailable(false)
      setInsightsErrorText(null)
      setErrorText(null)
      return
    }
    setActiveTab(initialTab)
    void loadUserDetail(user.id)
  }, [initialTab, isOpen, loadUserDetail, user])

  async function handleRefresh() {
    if (!user) return
    setRefreshing(true)
    try {
      await loadUserDetail(user.id, true)
      toast.success(txa('Kullanıcı detayları yenilendi.'))
    } finally {
      setRefreshing(false)
    }
  }

  const displayName = detail
    ? detail.profile.displayName?.trim() || detail.profile.username
    : user ? getUserDisplayName(user) : txa('Kullanıcı detayları')
  const trust = user ? getUserTrust(user) : null
  const resolvedProgression: AdminUserProgression | null = progression ?? (
    user?.progression ? { ...user.progression, events: [] } : null
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(89dvh,51.5rem)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(74rem,calc(100vw-2rem))] sm:rounded-xl sm:border"
        data-testid="admin-user-detail-modal"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{txa('{v1} kullanıcı detayları', { v1: displayName })}</DialogTitle>
          <DialogDescription>
            {txa('Kullanıcı profili, güveni, seviyesi, okuma geçmişi, fansub bağlantıları ve sahiplikleri.')}
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <ModalState
            icon={AlertCircle}
            title={txa('Kullanıcı seçilmedi')}
            description={txa('Detayları görüntülemek için kullanıcı listesinden bir kayıt seçin.')}
            onClose={onClose}
          />
        ) : loading && !detail ? (
          <ModalState
            icon={LoaderCircle}
            iconClassName="animate-spin motion-reduce:animate-none"
            title={txa('Kullanıcı detayları yükleniyor')}
            description={txa('@{v1} için doğrulanmış veriler hazırlanıyor.', { v1: user.username })}
            onClose={onClose}
          />
        ) : errorText && !detail ? (
          <ModalState
            icon={AlertCircle}
            title={txa('Detaylar yüklenemedi')}
            description={errorText}
            onClose={onClose}
            action={(
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void handleRefresh()}>
                <RefreshCw className="size-4" aria-hidden="true" />{' '}{txa('Yeniden dene')}
              </Button>
            )}
          />
        ) : detail && trust ? (
          <>
            <AdminUserDetailHeader
              detail={detail}
              user={user}
              progression={resolvedProgression}
              trust={trust}
              isRefreshing={refreshing}
              onRefresh={() => { void handleRefresh() }}
              onClose={onClose}
            />

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as AdminUserDetailTab)}
              className="min-h-0 gap-0 overflow-hidden"
            >
              <div className="shrink-0 overflow-x-auto border-b border-border bg-card px-2 sm:px-5">
                <TabsList variant="line" className="h-[3.25rem] min-w-max justify-start gap-0 p-0 group-data-[orientation=horizontal]/tabs:h-[3.25rem] sm:w-full">
                  {ADMIN_USER_DETAIL_TABS.map((tab) => {
                    const Icon = tab.icon
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="h-[3.25rem] min-h-11 flex-none rounded-none px-3 text-xs data-[state=active]:font-semibold data-[state=active]:text-primary sm:flex-1 sm:px-2"
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        {tab.label}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background p-3"
                data-testid="admin-user-detail-content"
              >
                <TabsContent value="profil" className="m-0">
                  <AdminUserDetailOverview
                    detail={detail}
                    user={user}
                    progression={resolvedProgression}
                    trust={trust}
                    isBusy={isBusy}
                    isSelf={currentUserId === user.id}
                    onToggleBan={onToggleBan}
                    onOpenOwnerships={() => setActiveTab('sahiplikler')}
                    onOpenModeration={() => setActiveTab('moderasyon')}
                  />
                </TabsContent>
                <TabsContent value="aktivite" className="m-0">
                  <AdminUserActivityTab insights={insights} unavailable={insightsUnavailable} errorText={insightsErrorText} />
                </TabsContent>
                <TabsContent value="okuma" className="m-0">
                  <AdminUserReadingTab detail={detail} insights={insights} />
                </TabsContent>
                <TabsContent value="fansub" className="m-0">
                  <AdminUserFansubTab detail={detail} />
                </TabsContent>
                <TabsContent value="yorumlar" className="m-0">
                  <AdminUserCommentsTab detail={detail} />
                </TabsContent>
                <TabsContent value="sahiplikler" className="m-0">
                  <AdminUserDetailOwnerships detail={detail} />
                </TabsContent>
                <TabsContent value="moderasyon" className="m-0">
                  <AdminUserModerationTab insights={insights} unavailable={insightsUnavailable} errorText={insightsErrorText} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ModalState({
  icon: Icon,
  iconClassName,
  title,
  description,
  action,
  onClose,
}: {
  icon: typeof AlertCircle
  iconClassName?: string
  title: string
  description: string
  action?: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="col-span-full row-span-full flex min-h-80 flex-col items-center justify-center p-8 text-center">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-4 top-4 min-h-11 min-w-11"
        onClick={onClose}
        aria-label={txa('Detaylı kullanıcı bilgilerini kapat')}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className={cn('size-5', iconClassName)} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export default AdminUserDetailModal
