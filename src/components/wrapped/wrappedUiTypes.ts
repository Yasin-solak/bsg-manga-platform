import type { WrappedPeriod } from '@/services/wrappedService'

export type WrappedSlideTheme = 'flare' | 'cyber' | 'sunset' | 'mint' | 'violet'

export interface WrappedPeriodOption {
    value: WrappedPeriod
    label: string
}

export interface WrappedStorySlide {
    id: string
    kicker: string
    title: string
    description: string
    primaryValue: string
    secondaryValue?: string
    stats?: Array<{ label: string, value: string }>
    chips?: string[]
    quote?: string
    backgroundImageUrl?: string
    theme: WrappedSlideTheme
}
