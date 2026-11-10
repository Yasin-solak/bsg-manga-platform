import { useMemo } from 'react'
import { Link } from '@/i18n/router'
import { ShoppingBag } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
import ProfileEditFrameCard from './ProfileEditFrameCard'
import { resolveProfileFrameTitle } from './profileFrameDisplay'
import { txa } from '@/i18n/activeLocale'

type ProfileEditFramesSectionProps = {
  avatarUrl: string
  disabled?: boolean
  equippedFrameId: string
  onClose: () => void
  onEquippedFrameChange: (frameId: string) => void
  ownedFrameIds: string[]
  resolvedFrames: ResolvedInventoryItem[]
}

export default function ProfileEditFramesSection({
  avatarUrl,
  disabled,
  equippedFrameId,
  onClose,
  onEquippedFrameChange,
  ownedFrameIds,
  resolvedFrames,
}: ProfileEditFramesSectionProps) {
  const resolvedFrameMap = useMemo(() => new Map(resolvedFrames.map((frame) => [frame.identifier, frame])), [resolvedFrames])
  const equippedFrameTitle = resolveProfileFrameTitle(equippedFrameId, resolvedFrameMap.get(equippedFrameId))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted-foreground">
          {txa('Kartin uzerine gel, cerceveyi avatarinla canli izle; sec ve sagdaki onizlemede gor.')}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">{ownedFrameIds.length}{' '}{txa('cerceve')}</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
            {equippedFrameTitle}
          </span>
        </div>
      </div>

      {ownedFrameIds.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {ownedFrameIds.map((frameId) => (
            <ProfileEditFrameCard
              key={frameId}
              avatarUrl={avatarUrl}
              disabled={disabled}
              frameId={frameId}
              item={resolvedFrameMap.get(frameId)}
              onSelect={() => onEquippedFrameChange(frameId)}
              selected={equippedFrameId === frameId}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-border/60 px-5 text-center">
          <p className="text-sm text-muted-foreground">{txa('Mağazadan çerçeve satın aldığında burada listelenir.')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
        <p className="m-0 text-xs text-muted-foreground">
          {txa('Yeni avatar çerçeveleri mağazaya eklendikçe burada listelenir.')}
        </p>
        <Button asChild variant="ghost" size="sm" className="rounded-full text-primary hover:bg-primary/10">
          <Link to="/magaza/katalog?tur=cerceve" onClick={onClose}>
            <ShoppingBag className="mr-1.5 size-3.5" />
            {txa('Mağazaya git')}
          </Link>
        </Button>
      </div>
    </section>
  )
}
