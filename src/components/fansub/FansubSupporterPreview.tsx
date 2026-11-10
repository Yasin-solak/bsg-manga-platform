import { Sparkles, Users, Zap } from 'lucide-react'
import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import { canRenderFansubSupporterSummary } from '@/lib/fansubBoostCapabilityGovernance'
import { resolveFansubBoostSupporterIdentityBadgeLabel, resolveFansubBoostSupporterStatusLine } from '@/lib/fansubBoostPresentation'
import { cn } from '@/lib/utils'
import type {
  FansubBoostSnapshot,
  FansubBoostSupporterPreview,
  FansubBoostSupporterState,
} from '@/services/fansubBoostService'
import { txa } from '@/i18n/activeLocale'

const PLAN_BADGE_ACCENT: Record<string, string> = {
  top: 'ring-amber-400/60 bg-amber-400/10',
  mega: 'ring-violet-400/60 bg-violet-400/10',
  monthly: 'ring-blue-400/40 bg-blue-400/8',
}

function resolveBadgeAccent(planCode: string | null) {
  if (!planCode) return PLAN_BADGE_ACCENT.monthly
  return PLAN_BADGE_ACCENT[planCode] ?? PLAN_BADGE_ACCENT.monthly
}

type FansubSupporterPreviewProps = {
  snapshot: FansubBoostSnapshot | null
  supporterState: FansubBoostSupporterState | null
  supporterPreview: FansubBoostSupporterPreview[]
  className?: string
}

export default function FansubSupporterPreview({
  snapshot,
  supporterState,
  supporterPreview,
  className,
}: FansubSupporterPreviewProps) {
  const canShowSupporterSummary = canRenderFansubSupporterSummary(
    snapshot?.capabilities,
    snapshot ? 'resolved' : 'unknown',
  )

  if (!snapshot || snapshot.activeSupporterCount <= 0 || !canShowSupporterSummary) return null

  const totalCount = snapshot.activeSupporterCount
  const previewCount = supporterPreview.length
  const overflowCount = Math.max(0, totalCount - previewCount)
  const noteRows = supporterPreview
    .filter((supporter) => supporter.latestSupporterNote)
    .slice(0, 2)

  return (
    <section
      data-testid="fansub-supporter-preview"
      data-supporter-summary-visible={canShowSupporterSummary ? 'true' : 'false'}
      className={cn(
      'rounded-[28px] border border-border/60 bg-card/60 px-5 py-5 backdrop-blur-sm',
      className,
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)] lg:items-start">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                <Zap className="size-3 text-primary" />
                {txa('Destekciler')}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">{txa('Boost gucunu tasiyan supporter katmani')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{totalCount}{' '}{txa('aktif')}</p>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex -space-x-3">
              {supporterPreview.map((supporter) => {
                const accent = resolveBadgeAccent(supporter.highestActivePlanCode)
                return (
                  <div
                    key={supporter.supporterUserId}
                    title={`@${supporter.username}`}
                    className={cn(
                      'relative size-11 shrink-0 overflow-hidden rounded-full ring-2',
                      accent,
                    )}
                  >
                    {supporter.avatarUrl ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={supporter.avatarUrl}
                        alt={supporter.username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs font-semibold text-muted-foreground">
                        {supporter.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                )
              })}

              {overflowCount > 0 ? (
                <div className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted/80 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
                  +{overflowCount}
                </div>
              ) : null}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {supporterPreview.slice(0, 3).map((supporter) => supporter.username).join(', ')}
                {supporterPreview.length > 3 ? txa(' ve digerleri') : ''}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {supporterPreview.slice(0, 2).map((supporter) => (
                  <FansubIdentityTagChip
                    key={`supporter-tag-${supporter.supporterUserId}`}
                    tag={supporter.activeFansubIdentityTag}
                    size='xs'
                  />
                ))}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {txa('Supporter listesi, fansub takviyesini sosyal kanit haline getirir.')}
              </p>
              {supporterPreview[0]?.rewardCapabilities ? (
                <p className="mt-1 text-[11px] text-primary/75">
                  {resolveFansubBoostSupporterStatusLine(supporterPreview[0].rewardCapabilities, snapshot?.capabilities) || txa('Kurucu destekci ve destek serisi kimligi burada gorunur.')}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {supporterState && supporterState.activeGrantCount > 0 ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-primary/80">{txa('Senin durumun')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{txa('Destekcisin')}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {txa('Aktif supporter durumun bu fansubun boost kimligine dahil durumda.')}
              </p>
              {resolveFansubBoostSupporterStatusLine(supporterState.rewardCapabilities, snapshot?.capabilities) ? (
                <p className="mt-1 text-[11px] text-primary/75">
                  {resolveFansubBoostSupporterStatusLine(supporterState.rewardCapabilities, snapshot?.capabilities)}
                </p>
              ) : null}
            </div>
          ) : null}

          {noteRows.length > 0 ? (
            <div className="space-y-2">
              {noteRows.map((supporter) => (
                <div key={`note-${supporter.supporterUserId}`} className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
                  <p className="text-xs font-medium text-foreground">
                    @{supporter.username}
                    <span className="ml-1 text-[11px] text-primary/75">
                      {resolveFansubBoostSupporterIdentityBadgeLabel(
                        supporter.rewardCapabilities,
                        txa('Destekci'),
                        snapshot?.capabilities,
                      )}
                    </span>
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">"{supporter.latestSupporterNote}"</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/35 px-4 py-4 text-sm leading-6 text-muted-foreground">
              {txa('Bu seviyede supporter gorunurlugu aktif. Not birakan destekciler burada one cikacak.')}
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-background/45 px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <Users className="size-4 text-primary" />
              <span className="font-medium">{txa('{v1} aktif supporter', { v1: totalCount })}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span>{txa('Seviye arttikca daha gorunur supporter yuzeyleri acilir.')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
