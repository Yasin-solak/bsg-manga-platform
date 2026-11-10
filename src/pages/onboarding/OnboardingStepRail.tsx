import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface OnboardingStepRailProps {
    activeStepId: string
    activeStepIndex: number
    submitting: boolean
    onSelectStep: (index: number) => void
    onSkip: () => void
    steps: Array<{
        id: string
        label: string
        description: string
        icon: LucideIcon
    }>
}

function OnboardingStepRail({
    activeStepId,
    activeStepIndex,
    submitting,
    onSelectStep,
    onSkip,
    steps,
}: OnboardingStepRailProps) {
    return (
        <aside className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-xl backdrop-blur lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
                    {txa('Akış haritası')}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {txa('Adımlar sağ rayda sabit durur; istediğin anda ileri geri bakabilirsin.')}
                </p>
            </div>

            <div className="mt-5 space-y-3">
                {steps.map((step, index) => {
                    const StepIcon = step.icon
                    const isActive = activeStepId === step.id
                    const isDone = index < activeStepIndex

                    return (
                        <button
                            key={step.id}
                            className={cn(
                                'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                                isActive
                                    ? 'border-primary/40 bg-primary/10'
                                    : isDone
                                        ? 'border-emerald-500/30 bg-emerald-500/10'
                                        : 'border-border/70 bg-background/70 hover:bg-background',
                            )}
                            onClick={() => onSelectStep(index)}
                            type="button"
                        >
                            <div
                                className={cn(
                                    'mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border',
                                    isActive
                                        ? 'border-primary/30 bg-primary text-primary-foreground'
                                        : isDone
                                            ? 'border-emerald-500/30 bg-emerald-500 text-white'
                                            : 'border-border bg-muted text-muted-foreground',
                                )}
                            >
                                <StepIcon className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">{txa(step.label)}</p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
                            </div>
                        </button>
                    )
                })}
            </div>

            <Button
                className="mt-5 w-full"
                onClick={onSkip}
                disabled={submitting}
                type="button"
                variant="outline"
            >
                {txa('Şimdilik geç')}
            </Button>
        </aside>
    )
}

export default OnboardingStepRail
