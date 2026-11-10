import type { LucideIcon } from 'lucide-react'
import { Sparkles } from 'lucide-react'
import { AvatarFrame } from '@/components/common/AvatarFrame'
import { Button } from '@/components/ui/button'
import { txa } from '@/i18n/activeLocale'

/**
 * Onboarding welcome screen.
 *
 * There was NO such screen before: on signing in the user dropped straight to the
 * "What do you like to read?" genre grid. The welcome says WHY before asking;
 * the step list shows how many steps up front, so the question
 * "how much longer" does not arise mid-screen.
 *
 * **The welcome is NOT A STEP.** The progress bar and "Step 1 / 3" counter did not
 * change: there is nothing to complete here, and counting it would show the user
 * a job they did not do as done.
 *
 * The step list comes from outside (ONBOARDING_STEPS). Written here by hand,
 * the welcome would silently lie the day a fourth step is added.
 */

export interface WelcomeStep {
  id: string
  label: string
  description: string
  icon: LucideIcon
}

interface OnboardingWelcomeProps {
  avatar: string
  displayName: string
  username: string
  frameType: string
  steps: WelcomeStep[]
  onStart: () => void
  onSkip: () => void
  skipping: boolean
}

export default function OnboardingWelcome({
  avatar,
  displayName,
  username,
  frameType,
  steps,
  onStart,
  onSkip,
  skipping,
}: OnboardingWelcomeProps) {
  return (
    <div
      className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center py-6"
      data-testid="onboarding-welcome"
    >
      <div className="rounded-[28px] border border-border/70 bg-card/95 p-6 shadow-xl backdrop-blur sm:p-8">
        <div className="flex items-center gap-3">
          <AvatarFrame
            src={avatar}
            alt={displayName}
            frameType={frameType}
            size={52}
          />
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="size-3" aria-hidden="true" />
              {txa('İlk kurulum')}
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-primary">@{username}</p>
          </div>
        </div>

        <h1 className="mt-5 text-[26px] font-black leading-tight tracking-tight text-foreground">
          {txa('Hoş geldin, {name}', { name: displayName })}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {txa('Birkaç dakikada seni tanıyalım; ana sayfan ilk günden senin olsun.')}
        </p>

        {/*
          Adimlar burada SAYILMAZ, tanitilir: kullanici neye evet dedigini
          bastan gorur. Numaralandirmak "1/3'tesin" izlenimi verir, oysa
          henuz baslamadi.
        */}
        <ul className="mt-6 space-y-3">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[12px] border border-border/70 bg-background/60 text-primary">
                <step.icon className="size-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold text-foreground">{txa(step.label)}</p>
                <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                  {txa(step.description)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          onClick={onStart}
          className="mt-7 h-12 w-full rounded-[14px] text-[15px] font-extrabold"
          data-testid="onboarding-welcome-start"
        >
          {txa('Başlayalım')}
        </Button>

        {/*
          txa('Şimdilik geç') karsilamada da duruyor: kurulumun zorunlu olmadigini
          en bastan soylemek, kullaniciyi uc adim boyunca cikis arattirmaktan
          iyidir.
        */}
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          disabled={skipping}
          className="mt-2 h-11 w-full rounded-[14px] text-sm font-bold text-muted-foreground"
          data-testid="onboarding-welcome-skip"
        >
          {txa('Şimdilik geç')}
        </Button>

        <p className="mt-4 text-center text-[11px] font-semibold text-muted-foreground">
          {txa('{count} adım · yaklaşık 1 dakika · sonra hepsini değiştirebilirsin', { count: steps.length })}
        </p>
      </div>
    </div>
  )
}
