import { Link } from '@/i18n/router'
import { Bell } from 'lucide-react'

import { Button } from '@/components/ui/button'
import ProfileEditProfileEffectCard from './ProfileEditProfileEffectCard'
import type { ProfileOwnedEffect } from './types'
import { txa } from '@/i18n/activeLocale'

type ProfileEditProfileEffectsSectionProps = {
  disabled?: boolean
  equippedProfileEffect: ProfileOwnedEffect | null
  onClose: () => void
  onEquippedProfileEffectChange: (effect: ProfileOwnedEffect | null) => void
  ownedProfileEffects: ProfileOwnedEffect[]
}

export default function ProfileEditProfileEffectsSection({
  disabled,
  equippedProfileEffect,
  onClose,
  onEquippedProfileEffectChange,
  ownedProfileEffects,
}: ProfileEditProfileEffectsSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted-foreground">
          {txa('Bir efekt seçerek sağdaki canlı önizlemede profil üzerindeki halini görebilirsin.')}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">{ownedProfileEffects.length}{' '}{txa('efekt')}</span>
          {equippedProfileEffect ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
              {equippedProfileEffect.name}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        <ProfileEditProfileEffectCard
          disabled={disabled}
          effect={null}
          onSelect={() => onEquippedProfileEffectChange(null)}
          selected={!equippedProfileEffect}
        />
        {ownedProfileEffects.map((effect) => (
          <ProfileEditProfileEffectCard
            key={effect.id}
            disabled={disabled}
            effect={effect}
            onSelect={() => onEquippedProfileEffectChange(effect)}
            selected={equippedProfileEffect?.id === effect.id}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
        <p className="m-0 text-xs text-muted-foreground">
          {txa('Yeni efektler ve özel tasarımlar mağazaya eklendikçe burada listelenir.')}
        </p>
        <Button asChild variant="ghost" size="sm" className="rounded-full text-primary hover:bg-primary/10">
          <Link to="/magaza/katalog?tur=efekt" onClick={onClose}>
            <Bell className="mr-1.5 size-3.5" />
            {txa('Mağazaya git')}
          </Link>
        </Button>
      </div>
    </section>
  )
}
