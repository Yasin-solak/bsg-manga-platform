import { useCallback, useMemo, useState } from 'react'
import {
  createAdminReadingStreakRewardRule,
  getAdminReadingStreakRewardDashboard,
  listAdminReadingStreakRewardClaims,
  listAdminReadingStreakRewardRules,
  saveAdminReadingStreakRewardRule,
  toRewardErrorMessage,
  type AdminReadingStreakRewardClaim,
  type AdminReadingStreakRewardDashboard,
  type AdminReadingStreakRewardRule,
} from '@/services/rewardService'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { txa } from '@/i18n/activeLocale'

const streakRewardsLogger = createScopedLogger('admin.readingStreakRewards')

function logStreakRewardError(event: string, error: unknown, context?: Record<string, unknown>) {
  const requestContext = createRequestContext('admin.readingStreakRewards', event, context)
  streakRewardsLogger.error({
    event: requestContext.event,
    message: txa('okuma serisi ödül işlemi başarısız oldu.'),
    context: toRequestContextLogContext(requestContext),
    error,
  })
}

export function useAdminReadingStreakRewards() {
  const [rules, setRules] = useState<AdminReadingStreakRewardRule[]>([])
  const [claims, setClaims] = useState<AdminReadingStreakRewardClaim[]>([])
  const [dashboard, setDashboard] = useState<AdminReadingStreakRewardDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextRules, nextClaims, nextDashboard] = await Promise.all([
        listAdminReadingStreakRewardRules(),
        listAdminReadingStreakRewardClaims(60),
        getAdminReadingStreakRewardDashboard(),
      ])
      setRules(nextRules)
      setClaims(nextClaims)
      setDashboard(nextDashboard)
    } catch (loadError) {
      logStreakRewardError('load', loadError)
      setRules([])
      setClaims([])
      setDashboard(null)
      setError(toRewardErrorMessage(loadError, txa('Okuma serisi ödülleri yüklenemedi.')))
    } finally {
      setLoading(false)
    }
  }, [])

  const updateRule = useCallback((ruleId: string, patch: Partial<AdminReadingStreakRewardRule>) => {
    setRules((prev) => prev.map((item) => (item.id === ruleId ? { ...item, ...patch } : item)))
  }, [])

  const saveRule = useCallback(async (rule: AdminReadingStreakRewardRule) => {
    setSavingId(rule.id)
    try {
      const saved = await saveAdminReadingStreakRewardRule({
        id: rule.id,
        slug: rule.slug,
        title: rule.title,
        description: rule.description,
        triggerType: rule.triggerType,
        targetValue: rule.targetValue,
        coinReward: rule.coinReward,
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
      })
      setRules((prev) => prev.map((item) => (item.id === saved.id ? saved : item)))
      toast.success(txa('"{v1}" okuma serisi odulu kaydedildi.', { v1: saved.title }))
      await load()
    } catch (saveError) {
      logStreakRewardError('save-rule', saveError, { ruleId: rule.id, slug: rule.slug })
      toast.error(toRewardErrorMessage(saveError, txa('Okuma serisi ödülü kaydedilemedi.')))
    } finally {
      setSavingId(null)
    }
  }, [load])

  const createRule = useCallback(async (form: {
    slug: string
    title: string
    description: string
    triggerType: AdminReadingStreakRewardRule['triggerType']
    targetValue: number
    coinReward: number
    sortOrder: number
  }) => {
    setCreating(true)
    try {
      await createAdminReadingStreakRewardRule({
        slug: form.slug || form.title,
        title: form.title,
        description: form.description,
        triggerType: form.triggerType,
        targetValue: form.targetValue,
        coinReward: form.coinReward,
        isActive: true,
        sortOrder: form.sortOrder,
      })
      toast.success(txa('"{v1}" okuma serisi odulu olusturuldu.', { v1: form.title }))
      await load()
    } catch (createError) {
      logStreakRewardError('create-rule', createError, { slug: form.slug, triggerType: form.triggerType })
      toast.error(toRewardErrorMessage(createError, txa('Okuma serisi ödülü oluşturulamadı.')))
    } finally {
      setCreating(false)
    }
  }, [load])

  const summary = useMemo(() => {
    const activeRules = dashboard?.activeRules ?? rules.filter((item) => item.isActive).length
    const claims30d = dashboard?.claims30d ?? claims.length
    const totalCoin30d = dashboard?.totalCoin30d
      ?? claims.reduce((sum, claim) => sum + claim.creditedCoin, 0)
    const readersToday = dashboard?.readersToday ?? 0
    return { activeRules, claims30d, totalCoin30d, readersToday }
  }, [claims, dashboard, rules])

  return {
    rules,
    claims,
    loading,
    error,
    savingId,
    creating,
    summary,
    load,
    updateRule,
    saveRule,
    createRule,
  }
}
