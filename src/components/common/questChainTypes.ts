import type { LucideIcon } from 'lucide-react'
import type { Quest } from '@/services/rewardService'

export interface QuestChain {
    groupKey: string
    theme: { icon: LucideIcon; label: string; text: string; bgBadge: string; progressBg: string; gradient: string; border: string }
    steps: Quest[]
    completedCount: number
    totalCount: number
    totalCoinReward: number
    activeStep: Quest | null
    isAllCompleted: boolean
}
