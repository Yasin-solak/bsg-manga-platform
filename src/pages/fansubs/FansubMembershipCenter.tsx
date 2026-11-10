import { Link } from '@/i18n/router'
import {
  Clock,
  Crown,
  Loader2,
  LogOut,
  Mail,
  Settings,
  Shield,
  UserCheck,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Fansub } from '@/types'
import type { FansubRequest } from '@/services/fansubService'
import type {
  FansubInvite,
  FansubJoinRequest,
  FansubMembership,
} from '@/services/fansubMembershipService'
import {
  ROLE_COLORS,
  STATUS_COLORS,
  formatDateTime,
  getMembershipName,
} from './fansubsPageShared'
import { buildPublicFansubPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface FansubMembershipCenterProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  currentUserId: string | null
  hubLoading: boolean
  membershipWorkflowAvailable: boolean
  busyActionKey: string | null
  canCreateFansubRequest: boolean
  myFansubRequests: FansubRequest[]
  myMemberships: FansubMembership[]
  myInvites: FansubInvite[]
  myJoinRequests: FansubJoinRequest[]
  fansubLookup: Map<string, Fansub>
  onRespondInvite: (inviteId: string, action: 'accept' | 'reject') => Promise<void>
  onLeaveMembership: (membership: FansubMembership) => Promise<void>
  onOpenRequest: () => void
}

function SummaryCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof UserCheck
  value: number
  label: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-background/45 px-4 py-3">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export function FansubMembershipCenter({
  isOpen,
  onOpenChange,
  currentUserId,
  hubLoading,
  membershipWorkflowAvailable,
  busyActionKey,
  canCreateFansubRequest,
  myFansubRequests,
  myMemberships,
  myInvites,
  myJoinRequests,
  fansubLookup,
  onRespondInvite,
  onLeaveMembership,
  onOpenRequest,
}: FansubMembershipCenterProps) {
  if (!currentUserId) return null

  const latestFansubRequest = myFansubRequests[0]
  const pendingInvites = myInvites.filter((invite) => invite.status === 'pending')
  const pendingJoinRequests = myJoinRequests.filter((request) => request.status === 'pending')

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-hidden border-white/10 bg-background/95 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-white/10 px-6 py-5 text-left">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary">
              <Shield className="mr-1 h-3.5 w-3.5" />
              {txa('Üyelik Merkezi')}
            </Badge>
            {hubLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>
          <SheetTitle className="mt-2 text-2xl font-semibold">{txa('Ekip bağlantılarını yönet')}</SheetTitle>
          <SheetDescription className="text-sm leading-6">
            {txa('Üyeliklerin, bekleyen davetlerin ve başvuruların tek merkezde. Ana keşif sayfasını kalabalıklaştırmadan operasyonu burada tutuyoruz.')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-116px)]">
          <div className="space-y-6 px-6 py-6">
            {!membershipWorkflowAvailable ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                {txa('Üyelik davet ve başvuru modülü veritabanında aktif değil. Mevcut davranış korunuyor.')}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard icon={UserCheck} value={myMemberships.length} label={txa('Aktif üyelik')} />
              <SummaryCard icon={Mail} value={pendingInvites.length} label={txa('Bekleyen davet')} />
              <SummaryCard icon={Clock} value={pendingJoinRequests.length} label={txa('Bekleyen başvuru')} />
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-card/65 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
                    {txa('Kendi yolun')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{txa('Fansub kurma akisi')}</h3>
                </div>
                <Button type="button" onClick={onOpenRequest} disabled={!canCreateFansubRequest}>
                  {txa('Fansub Kur')}
                </Button>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {txa('Tekrarlı fansub açma veya aktif üyelik üstüne kurulum engellenir. Mevcut talep durumun burada sabit görünür.')}
              </p>
              {latestFansubRequest ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-background/45 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn('border', STATUS_COLORS[latestFansubRequest.status] || '')}>
                      {latestFansubRequest.status}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">
                      {latestFansubRequest.requestedName}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {txa('Son guncelleme:')}{' '}{formatDateTime(latestFansubRequest.updatedAt)}
                  </p>
                  {latestFansubRequest.reviewNote ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {txa('Not:')}{' '}{latestFansubRequest.reviewNote}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <section className="space-y-3 rounded-[1.75rem] border border-white/10 bg-card/65 p-5">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
                    {txa('Üyeliklerim')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{txa('Aktif ekiplerin')}</h3>
                </div>
                {myMemberships.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{txa('Aktif bir ekip üyeliğin bulunmuyor.')}</p>
                ) : (
                  <div className="space-y-2">
                    {myMemberships.map((membership) => (
                      (() => {
                        const fansub = membership.fansub || fansubLookup.get(membership.fansubId)
                        const publicFansubHref = buildPublicFansubPath({
                          id: membership.fansubId,
                          slug: fansub?.slug,
                        })
                        return (
                      <div
                        key={membership.fansubId}
                        className="rounded-2xl border border-white/10 bg-background/45 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              to={publicFansubHref}
                              className="truncate text-sm font-semibold text-foreground hover:text-primary"
                            >
                              {getMembershipName(membership, fansubLookup)}
                            </Link>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={cn('border text-[10px]', ROLE_COLORS[membership.role] || '')}>
                                {membership.role}
                              </Badge>
                              {membership.teamTag ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {membership.teamTag}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {(membership.role === 'admin' || membership.role === 'moderator') ? (
                              <Button variant="ghost" size="icon-sm" asChild title={txa('Yönetim Paneli')}>
                                <Link to={`/fansub/${membership.fansubId}/yonet`}>
                                  <Settings className="h-4 w-4" />
                                </Link>
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => void onLeaveMembership(membership)}
                              disabled={busyActionKey === `leave-${membership.fansubId}`}
                              title={membership.role === 'admin' ? txa('Admin çıkışı için yönetim paneli kullanılır') : txa('Üyelikten ayrıl')}
                            >
                              {membership.role === 'admin' ? (
                                <Crown className="h-4 w-4" />
                              ) : (
                                <LogOut className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                        )
                      })()
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-[1.75rem] border border-white/10 bg-card/65 p-5">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
                    {txa('Davetler')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{txa('Gelen teklifler')}</h3>
                </div>
                {pendingInvites.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{txa('Bekleyen davet bulunmuyor.')}</p>
                ) : (
                  <div className="space-y-2">
                    {pendingInvites.map((invite) => (
                      <div key={invite.id} className="rounded-2xl border border-white/10 bg-background/45 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {invite.fansub?.name || txa('Fansub')}
                          </span>
                          <Badge variant="outline" className={cn('border text-[10px]', ROLE_COLORS[invite.role] || '')}>
                            {invite.role}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {invite.invitedByUser?.username || '?'} · {formatDateTime(invite.createdAt)}
                        </p>
                        {invite.note ? (
                          <p className="mt-2 text-sm text-muted-foreground">{invite.note}</p>
                        ) : null}
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => void onRespondInvite(invite.id, 'accept')}
                            disabled={busyActionKey === `invite-${invite.id}-accept`}
                          >
                            {txa('Kabul et')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void onRespondInvite(invite.id, 'reject')}
                            disabled={busyActionKey === `invite-${invite.id}-reject`}
                          >
                            {txa('Reddet')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-[1.75rem] border border-white/10 bg-card/65 p-5">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
                    {txa('Başvurularım')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{txa('Sıra bekleyen akışın')}</h3>
                </div>
                {myJoinRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{txa('Gönderilmiş bir ekip başvurun bulunmuyor.')}</p>
                ) : (
                  <div className="space-y-2">
                    {myJoinRequests.slice(0, 8).map((request) => (
                      <div key={request.id} className="rounded-2xl border border-white/10 bg-background/45 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {request.fansub?.name || fansubLookup.get(request.fansubId)?.name || txa('Fansub')}
                          </span>
                          <Badge variant="outline" className={cn('border text-[10px]', STATUS_COLORS[request.status] || '')}>
                            {request.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatDateTime(request.createdAt)}
                        </p>
                        {request.reviewNote ? (
                          <p className="mt-2 text-sm text-muted-foreground">{txa('Not:')}{' '}{request.reviewNote}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
