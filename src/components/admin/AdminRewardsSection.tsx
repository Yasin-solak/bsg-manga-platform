import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import {
  listAdminUserRewardTasks,
  listFansubMonthlyRewardRuns,
  listFansubRewardRankRules,
  listFansubRewardViewTiers,
  listRewardBadgeOptions,
  runFansubMonthlyRewards,
  saveAdminUserRewardTask,
  saveFansubRewardRankRule,
  saveFansubRewardViewTier,
  toRewardErrorMessage,
  getFansubMonthlyRewardPreview,
  createAdminUserRewardTask,
  deleteAdminUserRewardTask,
  listAdminFansubRewardTasks,
  createAdminFansubRewardTask,
  saveAdminFansubRewardTask,
  deleteAdminFansubRewardTask,
  type AdminUserRewardTask,
  type FansubMonthlyRewardPreviewRow,
  type FansubMonthlyRewardRunRow,
  type FansubRewardRankRule,
  type FansubRewardViewTier,
  type RewardBadgeOption,
} from '@/services/rewardService'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { AdminRewardsTabs } from './rewards/AdminRewardsTabs'
import { AdminRewardsStatGrid } from './rewards/AdminRewardsStatGrid'
import { AdminRewardsRulesCard } from './rewards/AdminRewardsRulesCard'
import { AdminRewardsMonthlyPreviewCard } from './rewards/AdminRewardsMonthlyPreviewCard'
import { AdminRewardsRunHistoryCard } from './rewards/AdminRewardsRunHistoryCard'
import { AdminQuestManagementCard } from './rewards/AdminQuestManagementCard'
import { AdminEventManagementCard } from './rewards/AdminEventManagementCard'
import { AdminReadingStreakRewardsCard } from './rewards/AdminReadingStreakRewardsCard'
import { useAdminReadingStreakRewards } from './rewards/useAdminReadingStreakRewards'
import {
  USER_QUEST_PHASE1_PRESET,
  USER_QUEST_PHASE1_PRESET_NAME,
} from './rewards/userQuestPresets'
import {
  formatMonthLabel,
  formatNumber,
  REWARDS_TAB_TO_HASH,
  rewardsTabFromHash,
  toMonthInput,
  lastClosedMonthInput,
  toMonthStart,
  type AdminRewardsTab,
  type TierFormState,
} from './rewards/adminRewardsUtils'
import { txa } from '@/i18n/activeLocale'

const adminRewardsLogger = createScopedLogger('admin.rewardsSection')
function logAdminRewardsError(event: string, error: unknown, context?: Record<string, unknown>) {
  const requestContext = createRequestContext('admin.rewardsSection', event, context)
  adminRewardsLogger.error({
    event: requestContext.event,
    message: txa('ödül yönetimi işlemi başarısız oldu.'),
    context: toRequestContextLogContext(requestContext),
    error,
  })
}

function AdminRewardsSection() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeTab = useMemo(
    () => rewardsTabFromHash(location.hash),
    [location.hash],
  )

  const [rankRules, setRankRules] = useState<FansubRewardRankRule[]>([])
  const [viewTiers, setViewTiers] = useState<FansubRewardViewTier[]>([])
  const [runs, setRuns] = useState<FansubMonthlyRewardRunRow[]>([])
  const [previewRows, setPreviewRows] = useState<FansubMonthlyRewardPreviewRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [runLoading, setRunLoading] = useState(false)
  const [savingRankId, setSavingRankId] = useState<string | null>(null)
  const [savingTierId, setSavingTierId] = useState<string | null>(null)
  const [newTierSaving, setNewTierSaving] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return toMonthInput(date)
  })
  const [newTier, setNewTier] = useState<TierFormState>({
    label: '',
    minViews: 150000,
    coinReward: 22000,
    isActive: true,
  })

  const [taskRows, setTaskRows] = useState<AdminUserRewardTask[]>([])
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [taskSavingId, setTaskSavingId] = useState<string | null>(null)
  const [badgeOptions, setBadgeOptions] = useState<RewardBadgeOption[]>([])
  const [taskCreating, setTaskCreating] = useState(false)
  const [userPresetApplying, setUserPresetApplying] = useState(false)

  // Fansub quest state
  const [fansubTaskRows, setFansubTaskRows] = useState<AdminUserRewardTask[]>([])
  const [fansubTaskLoading, setFansubTaskLoading] = useState(false)
  const [fansubTaskError, setFansubTaskError] = useState<string | null>(null)
  const [fansubTaskSavingId, setFansubTaskSavingId] = useState<string | null>(null)
  const [fansubTaskCreating, setFansubTaskCreating] = useState(false)

  const readingStreakRewards = useAdminReadingStreakRewards()
  const loadReadingStreakRewards = readingStreakRewards.load

  useEffect(() => {
    if (location.hash) return
    navigate(
      {
        pathname: location.pathname,
        hash: `#${REWARDS_TAB_TO_HASH.fansub}`,
      },
      { replace: true },
    )
  }, [location.hash, location.pathname, navigate])

  const monthStart = useMemo(() => toMonthStart(selectedMonth), [selectedMonth])

  const loadFansubConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const [rulesData, tierData, runData] = await Promise.all([
        listFansubRewardRankRules(),
        listFansubRewardViewTiers(),
        listFansubMonthlyRewardRuns(12),
      ])
      setRankRules(rulesData)
      setViewTiers(tierData)
      setRuns(runData)
    } catch (error) {
      logAdminRewardsError('load-fansub-config', error)
      toast.error(toRewardErrorMessage(error, txa('Ödül ayarları yüklenemedi.')))
    } finally {
      setConfigLoading(false)
    }
  }, [])

  const loadPreview = useCallback(async () => {
    if (!monthStart) {
      setPreviewRows([])
      setPreviewError(txa('Ay seçimi geçersiz.'))
      return
    }
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const data = await getFansubMonthlyRewardPreview(monthStart)
      setPreviewRows(data)
    } catch (error) {
      logAdminRewardsError('load-preview', error, { monthStart })
      setPreviewRows([])
      setPreviewError(
        toRewardErrorMessage(error, txa('Aylik on izleme verisi yuklenemedi.')),
      )
    } finally {
      setPreviewLoading(false)
    }
  }, [monthStart])

  const loadTaskData = useCallback(async () => {
    setTaskLoading(true)
    setTaskError(null)
    try {
      const [rows, badges] = await Promise.all([
        listAdminUserRewardTasks(),
        listRewardBadgeOptions(),
      ])
      setTaskRows(rows)
      setBadgeOptions(badges)
    } catch (error) {
      logAdminRewardsError('load-user-task-data', error)
      setTaskRows([])
      setTaskError(toRewardErrorMessage(error, txa('Kullanıcı görevleri yüklenemedi.')))
    } finally {
      setTaskLoading(false)
    }
  }, [])

  const loadFansubTaskData = useCallback(async () => {
    setFansubTaskLoading(true)
    setFansubTaskError(null)
    try {
      const [rows, badges] = await Promise.all([
        listAdminFansubRewardTasks(),
        badgeOptions.length > 0 ? Promise.resolve(badgeOptions) : listRewardBadgeOptions(),
      ])
      setFansubTaskRows(rows)
      if (badgeOptions.length === 0) setBadgeOptions(badges)
    } catch (error) {
      logAdminRewardsError('load-fansub-task-data', error)
      setFansubTaskRows([])
      setFansubTaskError(toRewardErrorMessage(error, txa('Fansub görevleri yüklenemedi.')))
    } finally {
      setFansubTaskLoading(false)
    }
  }, [badgeOptions])

  useEffect(() => {
    void loadFansubConfig()
    void loadPreview()
  }, [loadFansubConfig, loadPreview])

  useEffect(() => {
    if (activeTab !== 'user_tasks') return
    void loadTaskData()
  }, [activeTab, loadTaskData])

  useEffect(() => {
    if (activeTab !== 'fansub_tasks') return
    void loadFansubTaskData()
  }, [activeTab, loadFansubTaskData])

  useEffect(() => {
    if (activeTab !== 'reading_streak') return
    void loadReadingStreakRewards()
  }, [activeTab, loadReadingStreakRewards])

  const updateRankRule = useCallback(
    (ruleId: string, patch: Partial<FansubRewardRankRule>) => {
      setRankRules((prev) =>
        prev.map((item) => (item.id === ruleId ? { ...item, ...patch } : item)),
      )
    },
    [],
  )

  const updateViewTier = useCallback(
    (tierId: string, patch: Partial<FansubRewardViewTier>) => {
      setViewTiers((prev) =>
        prev.map((item) => (item.id === tierId ? { ...item, ...patch } : item)),
      )
    },
    [],
  )

  const updateTaskRow = useCallback(
    (rowId: string, patch: Partial<AdminUserRewardTask>) => {
      setTaskRows((prev) =>
        prev.map((item) => (item.id === rowId ? { ...item, ...patch } : item)),
      )
    },
    [],
  )

  async function handleSaveRankRule(rule: FansubRewardRankRule) {
    setSavingRankId(rule.id)
    try {
      const saved = await saveFansubRewardRankRule({
        id: rule.id,
        rankPosition: rule.rankPosition,
        coinReward: rule.coinReward,
        isActive: rule.isActive,
      })
      setRankRules((prev) => prev.map((item) => (item.id === saved.id ? saved : item)))
      toast.success(txa('Sıralama #{v1} ödülü güncellendi.', { v1: saved.rankPosition }))
      await loadPreview()
    } catch (error) {
      logAdminRewardsError('save-rank-rule', error, { ruleId: rule.id, rankPosition: rule.rankPosition })
      toast.error(toRewardErrorMessage(error, txa('Sıralama ödülü kaydedilemedi.')))
    } finally {
      setSavingRankId(null)
    }
  }

  async function handleSaveViewTier(tier: FansubRewardViewTier) {
    setSavingTierId(tier.id)
    try {
      const saved = await saveFansubRewardViewTier({
        id: tier.id,
        label: tier.label,
        minViews: tier.minViews,
        coinReward: tier.coinReward,
        isActive: tier.isActive,
      })
      setViewTiers((prev) => prev.map((item) => (item.id === saved.id ? saved : item)))
      toast.success(txa('{v1} tieri guncellendi.', { v1: saved.label }))
      await loadPreview()
    } catch (error) {
      logAdminRewardsError('save-view-tier', error, { tierId: tier.id, label: tier.label })
      toast.error(toRewardErrorMessage(error, txa('Tier kaydedilemedi.')))
    } finally {
      setSavingTierId(null)
    }
  }

  async function handleCreateViewTier() {
    if (!newTier.label.trim()) {
      toast.warning(txa('Tier etiketi boş olamaz.'))
      return
    }
    if (newTier.minViews <= 0) {
      toast.warning(txa('Min okunma 0\'dan büyük olmalıdır.'))
      return
    }

    setNewTierSaving(true)
    try {
      const created = await saveFansubRewardViewTier(newTier)
      setViewTiers((prev) => [...prev, created].sort((a, b) => a.minViews - b.minViews))
      setNewTier({
        label: '',
        minViews: newTier.minViews + 50000,
        coinReward: newTier.coinReward + 2500,
        isActive: true,
      })
      toast.success(txa('Yeni tier eklendi.'))
      await loadPreview()
    } catch (error) {
      logAdminRewardsError('create-view-tier', error, { label: newTier.label, minViews: newTier.minViews })
      toast.error(toRewardErrorMessage(error, txa('Yeni kademe oluşturulamadı.')))
    } finally {
      setNewTierSaving(false)
    }
  }

  async function handleRunMonthlyRewards() {
    if (!monthStart) {
      toast.warning(txa('Geçerli bir ay seç.'))
      return
    }

    setRunLoading(true)
    try {
      const result = await runFansubMonthlyRewards(monthStart)
      if (result.alreadyCompleted) {
        toast.info(
          txa('{v1} ödülü daha önce dağıtılmış.', { v1: formatMonthLabel(result.monthStart) }),
        )
      } else {
        toast.success(
          txa('{v1} ödülü dağıtıldı: {v2} fansub, {v3} coin.', { v1: formatMonthLabel(result.monthStart), v2: formatNumber(result.totalFansubs), v3: formatNumber(result.totalCoin) }),
        )
      }
      await Promise.all([loadFansubConfig(), loadPreview()])
    } catch (error) {
      logAdminRewardsError('run-monthly-rewards', error, { monthStart })
      toast.error(toRewardErrorMessage(error, txa('Aylık ödül dağıtılamadı.')))
    } finally {
      setRunLoading(false)
    }
  }

  async function handleSaveTaskRow(row: AdminUserRewardTask) {
    setTaskSavingId(row.id)
    try {
      await saveAdminUserRewardTask(row.id, {
        title: row.title,
        description: row.description,
        metricKey: row.metricKey,
        targetValue: row.targetValue,
        coinReward: row.coinReward,
        badgeId: row.badgeId,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
        taskGroup: row.taskGroup,
        tierLevel: row.tierLevel,
        unlockTaskId: row.unlockTaskId,
      })
      toast.success(txa('"{v1}" gorevi kaydedildi.', { v1: row.title }))
      await loadTaskData()
    } catch (error) {
      logAdminRewardsError('save-user-task-row', error, { rowId: row.id, slug: row.slug })
      toast.error(toRewardErrorMessage(error, txa('Görev güncellenemedi.')))
    } finally {
      setTaskSavingId(null)
    }
  }

  // Create/delete user quests
  async function handleCreateUserTask(form: { slug: string; title: string; description: string; metricKey: string; targetValue: number; coinReward: number; tierLevel: number; taskGroup: string; unlockTaskId?: string | null }) {
    setTaskCreating(true)
    try {
      await createAdminUserRewardTask(form)
      toast.success(txa('"{v1}" gorevi olusturuldu.', { v1: form.title }))
      await loadTaskData()
    } catch (error) {
      logAdminRewardsError('create-user-task', error, { slug: form.slug, metricKey: form.metricKey })
      toast.error(toRewardErrorMessage(error, txa('Görev oluşturulamadı.')))
    } finally {
      setTaskCreating(false)
    }
  }

  async function handleDeleteUserTask(taskId: string) {
    try {
      await deleteAdminUserRewardTask(taskId)
      setTaskRows((prev) => prev.filter((t) => t.id !== taskId))
      toast.success(txa('Görev silindi.'))
    } catch (error) {
      logAdminRewardsError('delete-user-task', error, { taskId })
      toast.error(toRewardErrorMessage(error, txa('Görev silinemedi.')))
    }
  }

  async function handleApplyUserQuestPhase1Preset() {
    if (taskLoading || taskCreating || !!taskSavingId || userPresetApplying) {
      toast.info(txa('Görev kaydedilirken hazır set uygulanamaz.'))
      return
    }

    setUserPresetApplying(true)
    try {
      const existingBySlug = new Map(taskRows.map((row) => [row.slug, row]))

      for (const preset of USER_QUEST_PHASE1_PRESET) {
        const current = existingBySlug.get(preset.slug)

        if (current) {
          await saveAdminUserRewardTask(current.id, {
            title: preset.title,
            description: preset.description,
            metricKey: preset.metricKey,
            targetValue: preset.targetValue,
            coinReward: preset.coinReward,
            sortOrder: preset.sortOrder,
            taskGroup: preset.taskGroup,
            tierLevel: preset.tierLevel,
            isActive: true,
            unlockTaskId: null,
          })
          continue
        }

        const created = await createAdminUserRewardTask({
          slug: preset.slug,
          title: preset.title,
          description: preset.description,
          metricKey: preset.metricKey,
          targetValue: preset.targetValue,
          coinReward: preset.coinReward,
          sortOrder: preset.sortOrder,
          taskGroup: preset.taskGroup,
          tierLevel: preset.tierLevel,
          unlockTaskId: null,
        })

        existingBySlug.set(created.slug, created)
      }

      const refreshedRows = await listAdminUserRewardTasks()
      const refreshedBySlug = new Map(refreshedRows.map((row) => [row.slug, row]))

      for (const preset of USER_QUEST_PHASE1_PRESET) {
        const row = refreshedBySlug.get(preset.slug)
        if (!row) continue

        const unlockTaskId = preset.unlockSlug
          ? refreshedBySlug.get(preset.unlockSlug)?.id ?? null
          : null

        if ((row.unlockTaskId || null) === unlockTaskId) continue

        await saveAdminUserRewardTask(row.id, { unlockTaskId })
      }

      await loadTaskData()
      toast.success(txa('{v1} uygulandi.', { v1: txa(USER_QUEST_PHASE1_PRESET_NAME) }))
    } catch (error) {
      logAdminRewardsError('apply-user-quest-phase1-preset', error, { preset: USER_QUEST_PHASE1_PRESET_NAME, taskCount: USER_QUEST_PHASE1_PRESET.length })
      toast.error(toRewardErrorMessage(error, txa('Kullanıcı görev seti uygulanamadı.')))
    } finally {
      setUserPresetApplying(false)
    }
  }
  // Fansub quest CRUD
  async function handleSaveFansubTaskRow(row: AdminUserRewardTask) {
    setFansubTaskSavingId(row.id)
    try {
      await saveAdminFansubRewardTask(row.id, {
        title: row.title,
        description: row.description,
        metricKey: row.metricKey,
        targetValue: row.targetValue,
        coinReward: row.coinReward,
        badgeId: row.badgeId,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
        taskGroup: row.taskGroup,
        tierLevel: row.tierLevel,
        unlockTaskId: row.unlockTaskId,
      })
      toast.success(txa('"{v1}" fansub gorevi kaydedildi.', { v1: row.title }))
      await loadFansubTaskData()
    } catch (error) {
      logAdminRewardsError('save-fansub-task-row', error, { rowId: row.id, slug: row.slug })
      toast.error(toRewardErrorMessage(error, txa('Fansub görevi güncellenemedi.')))
    } finally {
      setFansubTaskSavingId(null)
    }
  }

  async function handleCreateFansubTask(form: { slug: string; title: string; description: string; metricKey: string; targetValue: number; coinReward: number; tierLevel: number; taskGroup: string; unlockTaskId?: string | null }) {
    setFansubTaskCreating(true)
    try {
      await createAdminFansubRewardTask(form)
      toast.success(txa('"{v1}" fansub gorevi olusturuldu.', { v1: form.title }))
      await loadFansubTaskData()
    } catch (error) {
      logAdminRewardsError('create-fansub-task', error, { slug: form.slug, metricKey: form.metricKey })
      toast.error(toRewardErrorMessage(error, txa('Fansub görevi oluşturulamadı.')))
    } finally {
      setFansubTaskCreating(false)
    }
  }

  async function handleDeleteFansubTask(taskId: string) {
    try {
      await deleteAdminFansubRewardTask(taskId)
      setFansubTaskRows((prev) => prev.filter((t) => t.id !== taskId))
      toast.success(txa('Fansub görevi silindi.'))
    } catch (error) {
      logAdminRewardsError('delete-fansub-task', error, { taskId })
      toast.error(toRewardErrorMessage(error, txa('Fansub görevi silinemedi.')))
    }
  }

  // Deletion also removes claim records (claims ON DELETE CASCADE): through a dialog stating the result.
  const [deleteConfirm, setDeleteConfirm] = useState<AdminConfirmRequest | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const askDeleteTask = (kind: 'user' | 'fansub', taskId: string) => {
    const row = (kind === 'user' ? taskRows : fansubTaskRows).find((entry) => entry.id === taskId)
    setDeleteConfirm({
      title: txa('Görevi sil'),
      subject: row?.title ?? txa('Görev'),
      consequence: txa('Görev ve {v1} bu görevi alma kayıtları kalıcı olarak silinir; daha önce verilen coin ve rozetler geri alınmaz. Geçmişi korumak için silmek yerine pasife al.', { v1: kind === 'user' ? txa('kullanıcıların') : txa('fansubların') }),
      confirmLabel: txa('Kalıcı olarak sil'),
      destructive: true,
      run: () => (kind === 'user' ? handleDeleteUserTask(taskId) : handleDeleteFansubTask(taskId)),
    })
  }
  const runDeleteConfirm = async () => {
    if (!deleteConfirm) return
    setDeleteBusy(true)
    try {
      await deleteConfirm.run()
      setDeleteConfirm(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  const updateFansubTaskRow = useCallback(
    (rowId: string, patch: Partial<AdminUserRewardTask>) => {
      setFansubTaskRows((prev) =>
        prev.map((item) => (item.id === rowId ? { ...item, ...patch } : item)),
      )
    },
    [],
  )

  const fansubSummary = useMemo(() => {
    const activeRankRules = rankRules.filter((item) => item.isActive).length
    const activeViewTiers = viewTiers.filter((item) => item.isActive).length
    const totalPreviewCoin = previewRows.reduce(
      (sum, item) => sum + item.totalCoinReward,
      0,
    )
    const lastRun = runs.find((run) => run.status === 'completed')
    return { activeRankRules, activeViewTiers, totalPreviewCoin, lastRun }
  }, [previewRows, rankRules, runs, viewTiers])

  // Months finished after the last payout but not paid (not tied to fixed order, at most 24).
  const pendingClosedMonths = useMemo(() => {
    const last = fansubSummary.lastRun?.monthStart
    if (!last) return 0
    const lastClosed = lastClosedMonthInput()
    const [ly, lm] = last.slice(0, 7).split('-').map(Number)
    const [cy, cm] = lastClosed.split('-').map(Number)
    return Math.max(0, Math.min(24, (cy - ly) * 12 + (cm - lm)))
  }, [fansubSummary.lastRun])

  const taskSummary = useMemo(() => {
    const activeTasks = taskRows.filter((item) => item.isActive).length
    const totalCoinPool = taskRows
      .filter((item) => item.isActive)
      .reduce((sum, item) => sum + item.coinReward, 0)
    return { activeTasks, totalCoinPool, totalTasks: taskRows.length }
  }, [taskRows])

  function handleTabChange(tab: AdminRewardsTab) {
    navigate({
      pathname: location.pathname,
      hash: `#${REWARDS_TAB_TO_HASH[tab]}`,
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <AdminSectionHeader
        title={txa('Ödüller ve görevler')}
        description={txa('Fansublara aylık okunma ödülü, okuma serisi ödülleri, kullanıcı ve fansub görevleri, etkinlikler.')}
      />

      <AdminRewardsTabs activeTab={activeTab} onChange={handleTabChange} />

      {activeTab === 'fansub' && (
        <>
          <AdminRewardsStatGrid
            items={[
              { label: txa('Son dağıtılan ay'), value: fansubSummary.lastRun ? formatMonthLabel(fansubSummary.lastRun.monthStart) : '—' },
              { label: txa('Dağıtılmamış biten ay'), value: formatNumber(pendingClosedMonths), tone: pendingClosedMonths > 0 ? 'amber' : undefined },
              { label: txa('Seçilen ay toplamı'), value: `${formatNumber(fansubSummary.totalPreviewCoin)} coin` },
              { label: txa('Etkin kural / kademe'), value: `${formatNumber(fansubSummary.activeRankRules)} / ${formatNumber(fansubSummary.activeViewTiers)}` },
            ]}
          />

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <AdminRewardsMonthlyPreviewCard
              selectedMonth={selectedMonth}
              previewLoading={previewLoading}
              previewError={previewError}
              previewRows={previewRows}
              runs={runs}
              runLoading={runLoading}
              onSelectedMonthChange={setSelectedMonth}
              onReloadPreview={() => {
                void loadPreview()
              }}
              onRunMonthlyRewards={handleRunMonthlyRewards}
            />
            <div className="flex min-w-0 flex-col gap-4">
              <AdminRewardsRulesCard
                configLoading={configLoading}
                rankRules={rankRules}
                savingRankId={savingRankId}
                onUpdateRule={updateRankRule}
                onSaveRule={(rule) => {
                  void handleSaveRankRule(rule)
                }}
                viewTiers={viewTiers}
                savingTierId={savingTierId}
                newTier={newTier}
                newTierSaving={newTierSaving}
                onUpdateTier={updateViewTier}
                onSaveTier={(tier) => {
                  void handleSaveViewTier(tier)
                }}
                onChangeNewTier={(patch) => {
                  setNewTier((prev) => ({ ...prev, ...patch }))
                }}
                onCreateTier={() => {
                  void handleCreateViewTier()
                }}
              />
              <AdminRewardsRunHistoryCard configLoading={configLoading} runs={runs} />
            </div>
          </div>
        </>
      )}

      {activeTab === 'reading_streak' && (
        <>
          <AdminRewardsStatGrid
            items={[
              { label: txa('Etkin kural'), value: formatNumber(readingStreakRewards.summary.activeRules) },
              { label: txa('30 günde kazanım'), value: formatNumber(readingStreakRewards.summary.claims30d) },
              {
                label: txa('30 günde coin'),
                value: formatNumber(readingStreakRewards.summary.totalCoin30d),
              },
              {
                label: txa('Bugün okuyan'),
                value: formatNumber(readingStreakRewards.summary.readersToday),
              },
            ]}
          />

          <AdminReadingStreakRewardsCard
            loading={readingStreakRewards.loading}
            error={readingStreakRewards.error}
            rules={readingStreakRewards.rules}
            claims={readingStreakRewards.claims}
            savingId={readingStreakRewards.savingId}
            creating={readingStreakRewards.creating}
            onUpdateRule={readingStreakRewards.updateRule}
            onSaveRule={(rule) => void readingStreakRewards.saveRule(rule)}
            onCreateRule={(form) => void readingStreakRewards.createRule(form)}
            onReload={() => void readingStreakRewards.load()}
          />
        </>
      )}

      {activeTab === 'user_tasks' && (
        <>
          <AdminRewardsStatGrid
            items={[
              { label: txa('Toplam görev'), value: formatNumber(taskSummary.totalTasks) },
              { label: txa('Etkin görev'), value: formatNumber(taskSummary.activeTasks) },
              {
                label: txa('Etkin görev toplam coin'),
                value: formatNumber(taskSummary.totalCoinPool),
              },
              {
                label: txa('Seçilebilir rozet'),
                value: formatNumber(badgeOptions.length),
              },
            ]}
          />

          <AdminQuestManagementCard
            mode="user"
            loading={taskLoading}
            error={taskError}
            rows={taskRows}
            badgeOptions={badgeOptions}
            savingId={taskSavingId}
            onUpdateRow={updateTaskRow}
            onSaveRow={(row) => void handleSaveTaskRow(row)}
            onCreateRow={(form) => void handleCreateUserTask(form)}
            onDeleteRow={(id) => askDeleteTask('user', id)}
            creating={taskCreating}
            presetLabel={txa(USER_QUEST_PHASE1_PRESET_NAME)}
            presetLoading={userPresetApplying}
            onApplyPreset={() => {
              void handleApplyUserQuestPhase1Preset()
            }}
          />
        </>
      )}

      {activeTab === 'fansub_tasks' && (
        <>
          <AdminRewardsStatGrid
            items={[
              { label: txa('Toplam görev'), value: formatNumber(fansubTaskRows.length) },
              { label: txa('Etkin görev'), value: formatNumber(fansubTaskRows.filter((r) => r.isActive).length) },
              {
                label: txa('Etkin toplam coin'),
                value: formatNumber(fansubTaskRows.filter((r) => r.isActive).reduce((s, r) => s + r.coinReward, 0)),
              },
              {
                label: txa('Seçilebilir rozet'),
                value: formatNumber(badgeOptions.length),
              },
            ]}
          />

          <AdminQuestManagementCard
            mode="fansub"
            loading={fansubTaskLoading}
            error={fansubTaskError}
            rows={fansubTaskRows}
            badgeOptions={badgeOptions}
            savingId={fansubTaskSavingId}
            onUpdateRow={updateFansubTaskRow}
            onSaveRow={(row) => void handleSaveFansubTaskRow(row)}
            onCreateRow={(form) => void handleCreateFansubTask(form)}
            onDeleteRow={(id) => askDeleteTask('fansub', id)}
            creating={fansubTaskCreating}
          />
        </>
      )}

      {activeTab === 'events' && <AdminEventManagementCard />}

      <AdminConfirmDialog request={deleteConfirm} busy={deleteBusy} onCancel={() => setDeleteConfirm(null)} onConfirm={() => { void runDeleteConfirm() }} />
    </section>
  )
}

export default AdminRewardsSection
