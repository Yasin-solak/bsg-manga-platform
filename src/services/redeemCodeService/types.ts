export type RedeemCodeTargetType = 'user' | 'fansub' | 'both'
export type RedeemWalletTarget = 'user' | 'fansub'

export interface AdminRedeemCodeItem {
  id: string
  code: string
  value: number
  maxUses: number
  usedCount: number
  targetType: RedeemCodeTargetType
  expiresAt: string
  isActive: boolean
  createdAt: string
  remainingUses: number
  isExpired: boolean
  seriesLabel?: string | null
  distributionChannel?: string | null
  notes?: string | null
  createdBy?: string | null
}

export interface AdminRedeemUsageCounts {
  userActivations: number
  fansubActivations: number
}

export interface AdminRedeemUsageEvent {
  id: string
  codeId: string
  code: string
  targetType: RedeemWalletTarget
  creditedValue: number
  redeemedAt: string
  userId: string | null
  username: string
  userAvatarUrl: string | null
  fansubId: string | null
  fansubName: string | null
}

export interface CreateRedeemCodesInput {
  value: number
  count: number
  maxUses: number
  targetType: RedeemCodeTargetType
  expiresAt: string
  prefix?: string
  seriesLabel?: string
  distributionChannel?: string
  notes?: string
}

export interface AdminCoinCodeOverview {
  generatedAt: string
  periodDays: 7 | 30 | 90
  totalCodes: number
  activeCodes: number
  passiveCodes: number
  expiredCodes: number
  usedCodes: number
  totalActivations: number
  distributedCoin: number
  activeExposureCoin: number
  potentialDistributionCoin: number
  highRiskCodes: number
  expiringSevenDays: number
  userActivations: number
  fansubActivations: number
  daily: Array<{ day: string; activations: number; targetSignals: number }>
}

export interface AdminCoinCodeCursor {
  createdAt: string
  id: string
}

export interface AdminCoinActivationCursor {
  redeemedAt: string
  key: string
}

export interface AdminCoinCodePage {
  generatedAt: string
  items: AdminRedeemCodeItem[]
  total: number
  hasNext: boolean
  nextCursor: AdminCoinCodeCursor | null
}

export interface AdminCoinActivationPage {
  generatedAt: string
  items: AdminRedeemUsageEvent[]
  total: number
  hasNext: boolean
  nextCursor: AdminCoinActivationCursor | null
}

export interface RedeemCoinCodeInput {
  userId: string
  code: string
  target: RedeemWalletTarget
  fansubId?: string
}

export interface RedeemCoinCodeResult {
  targetType: RedeemWalletTarget
  codeId: string
  code: string
  creditedValue: number
  newBalance: number
  redeemedAt: string
  fansubId?: string
}
