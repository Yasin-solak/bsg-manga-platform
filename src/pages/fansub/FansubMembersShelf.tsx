import { ExternalLink, Users } from 'lucide-react'
import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useState } from 'react'
import { AvatarFrame } from '@components/common/AvatarFrame'
import { ProfileHoverLink } from '@/components/common/ProfileHoverLink'
import ProfileShelfDialog from '../profile/ProfileShelfDialog'
import type { FansubMember } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

const FANSUB_MEMBER_VISIBLE_COUNT = 4

type FansubMembersShelfProps = {
  members: FansubMember[]
}

export default function FansubMembersShelf({
  members,
}: FansubMembersShelfProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const visibleMembers = members.slice(0, FANSUB_MEMBER_VISIBLE_COUNT)

  return (
    <>
      <Card className="rounded-[30px] border-border/70 bg-background/80 shadow-none">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txa('Ekip izi')}</p>
              <h2 className="text-2xl font-semibold text-foreground">{txa('Üyeler')}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {txa('Vitrinde ilk dört ekip üyesi görünür. Tüm ekip pencerede açılır.')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-border/70 bg-background/60 text-foreground">
                {members.length.toLocaleString(intlLocale())}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs font-medium text-primary"
                onClick={() => setDialogOpen(true)}
              >
                {txa('Tümünü gör')}
              </Button>
            </div>
          </div>

          <div className="mt-5">
            {visibleMembers.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleMembers.map((member) => (
                  <ProfileHoverLink
                    key={member.id}
                    userId={member.id}
                    username={member.username}
                    avatar={member.avatar}
                    frameType={member.frameType ?? 'default'}
                    className="group flex min-w-0 items-center gap-3 rounded-[22px] border border-border/60 bg-card/60 p-3 no-underline transition-colors hover:border-primary/30 hover:bg-card"
                  >
                    <AvatarFrame
                      src={member.avatar}
                      alt={member.username}
                      frameType={member.frameType ?? 'default'}
                      size={52}
                      animated={false}
                      hoverPlayback='never'
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="m-0 truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                          {member.username}
                        </p>
                        <FansubIdentityTagChip tag={member.activeFansubIdentityTag} size='xs' />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="border-border/70 bg-background/70 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {member.role}
                        </Badge>
                        {member.teamTag ? (
                          <Badge className="bg-primary/12 text-[10px] uppercase tracking-[0.14em] text-primary">
                            {member.teamTag}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </ProfileHoverLink>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-border/70 bg-card/50 px-6 py-12 text-center">
                <Users className="size-5 text-muted-foreground" />
                <p className="m-0 text-sm leading-6 text-muted-foreground">
                  {txa('Henüz vitrinde görünen bir ekip üyesi yok.')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {dialogOpen ? (
        <ProfileShelfDialog
          description={txa('Fansub ekibinin tam listesi ve roller bu pencerede açılır.')}
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          title={txa('Fansub üyeleri')}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {members.length > 0 ? members.map((member) => (
              <ProfileHoverLink
                key={member.id}
                userId={member.id}
                username={member.username}
                avatar={member.avatar}
                frameType={member.frameType ?? 'default'}
                className="group flex min-w-0 items-center gap-3 rounded-[22px] border border-border/60 bg-card/60 p-3 no-underline transition-colors hover:border-primary/30 hover:bg-card"
              >
                <AvatarFrame
                  src={member.avatar}
                  alt={member.username}
                  frameType={member.frameType ?? 'default'}
                  size={52}
                  animated
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="m-0 truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                      {member.username}
                    </p>
                    <FansubIdentityTagChip tag={member.activeFansubIdentityTag} size='xs' />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="border-border/70 bg-background/70 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {member.role}
                    </Badge>
                    {member.teamTag ? (
                      <Badge className="bg-primary/12 text-[10px] uppercase tracking-[0.14em] text-primary">
                        {member.teamTag}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </ProfileHoverLink>
            )) : (
              <div className="rounded-[22px] border border-dashed border-border/60 px-5 py-8 text-center text-sm text-muted-foreground">
                {txa('Henüz gösterilecek üye yok.')}
              </div>
            )}
          </div>
        </ProfileShelfDialog>
      ) : null}
    </>
  )
}
