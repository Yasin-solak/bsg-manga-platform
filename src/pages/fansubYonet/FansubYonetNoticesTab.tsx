/**
 * FansubYonetNoticesTab v2: studio 'Notices' tab.
 *
 * Two jobs: (1) up to three notices pinned on the fansub profile, each slot in its own
 * card with publish / unpublish / edit / delete; (2) a one-time special notification
 * to followers. Unpublishing and deleting are not blocked by the boost gate (the server applies
 * the same rule); a notice whose target was deleted is marked with a warning.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  BellRinging,
  Clock,
  EyeSlash,
  Eye,
  Megaphone,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  FANSUB_PINNED_NOTICE_MAX_COUNT,
  FANSUB_SPECIAL_NOTIFICATION_COOLDOWN_MINUTES,
  FANSUB_SPECIAL_NOTIFICATION_DAILY_LIMIT,
  FANSUB_SPECIAL_NOTIFICATION_DUPLICATE_WINDOW_HOURS,
  FANSUB_SPECIAL_NOTIFICATION_MESSAGE_MAX,
  FANSUB_SPECIAL_NOTIFICATION_TITLE_MAX,
  type FansubNoticeActionTarget,
} from '@/lib/fansubNotices'
import {
  deleteFansubPinnedNotice,
  listFansubSpecialNotificationBroadcasts,
  listManageFansubPinnedNotices,
  sendFansubSpecialNotification,
  setFansubPinnedNoticeActive,
  upsertFansubPinnedNotice,
  type FansubNotificationBroadcast,
  type FansubPinnedNotice,
} from '@/services/fansubNoticeService'
import { toast } from '@/services/toastService'
import { Panel, ToneIcon } from '@/pages/profile/ProfileTabKit'
import FansubNoticeComposerDialog, { type FansubNoticeEditorValue } from './FansubNoticeComposerDialog'
import FansubNoticeTargetSelector from './FansubNoticeTargetSelector'
import {
  findNoticeTargetOption,
  getDefaultNoticeTargetId,
  loadFansubNoticeTargetOptions,
  type FansubNoticeTargetOptionMap,
} from './fansubNoticeTargetOptions'
import {
  buildDuplicateBroadcastMatch,
  createEmptyTargetOptionMap,
  createNoticeEditorValue,
  createNotificationFormState,
  DEFAULT_NOTIFICATION_TARGET,
  findNextAvailableNoticeSlot,
  formatRelativeMinutes,
  type NotificationFormState,
  NoticeLockCard,
  type FansubYonetNoticesTabProps,
  normalizeText,
  resolveTierLockCopy,
} from './fansubYonetNotices.shared'
import { formatRelative } from './FansubYonetOverviewPanels'
import { intlLocale, txa } from '@/i18n/activeLocale'

const TARGET_LABEL: Record<FansubNoticeActionTarget, string> = {
  get mangalar() { return txa('Seri') },
  get bolumler() { return txa('Bölüm') },
  get listeler() { return txa('Liste') },
}

function NoticeSlotCard({
  notice,
  targetMissing,
  busy,
  canPublish,
  onToggle,
  onEdit,
  onDelete,
}: {
  notice: FansubPinnedNotice
  targetMissing: boolean
  busy: boolean
  canPublish: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    if (!confirmDelete) return
    const timer = window.setTimeout(() => setConfirmDelete(false), 4000)
    return () => window.clearTimeout(timer)
  }, [confirmDelete])

  return (
    <article
      className={cn(
        'flex min-h-[176px] flex-col rounded-2xl border bg-background/40 p-4 transition-colors',
        notice.isActive ? 'border-emerald-500/30' : 'border-border/70',
      )}
      data-testid={`studio-notice-slot-${notice.slotIndex}`}
    >
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', notice.isActive ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
          <span className={cn('size-1.5 rounded-full', notice.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
          {notice.isActive ? txa('Yayında') : txa('Yayında değil')}
        </span>
        <span className="text-[11.5px] text-muted-foreground">{txa('Slot {v1}', { v1: notice.slotIndex + 1 })}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{formatRelative(notice.updatedAt)}</span>
      </div>

      <h4 className="mt-3 line-clamp-2 text-[15px] font-bold leading-snug [overflow-wrap:anywhere]">{normalizeText(notice.title)}</h4>
      <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{normalizeText(notice.body)}</p>

      <div className="mt-3 text-[12px]">
        {targetMissing ? (
          <span className="flex items-start gap-1.5 rounded-xl bg-amber-500/10 px-2.5 py-1.5 text-amber-700 dark:text-amber-300">
            <WarningCircle size={14} weight="fill" className="mt-0.5 flex-none" />
            {txa('Bağlı {v1} artık yok. Düzenleyip yeni bir hedef seç.', { v1: TARGET_LABEL[notice.actionTarget].toLocaleLowerCase(intlLocale()) })}
          </span>
        ) : (
          <span className="text-muted-foreground">{TARGET_LABEL[notice.actionTarget]}: <b className="font-semibold text-foreground">{notice.actionLabel || txa('Hedef')}</b></span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
        <Button
          type="button"
          size="sm"
          variant={notice.isActive ? 'outline' : 'default'}
          className="rounded-full"
          disabled={busy || (!notice.isActive && (!canPublish || targetMissing))}
          onClick={onToggle}
        >
          {notice.isActive ? <EyeSlash size={14} /> : <Eye size={14} />}
          {notice.isActive ? txa('Yayından kaldır') : txa('Yayınla')}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full" disabled={busy || !canPublish} onClick={onEdit}>
          <PencilSimple size={14} />{txa('Düzenle')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn('ml-auto rounded-full', confirmDelete ? 'bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive' : 'text-muted-foreground')}
          disabled={busy}
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          aria-label={txa('Duyuruyu sil')}
        >
          <Trash size={14} />{confirmDelete ? txa('Silmeyi onayla') : txa('Sil')}
        </Button>
      </div>
    </article>
  )
}

export default function FansubYonetNoticesTab({
  fansubId,
  fansubSlug,
  fansubName,
  isBoostEnabled,
  boostSnapshot,
}: FansubYonetNoticesTabProps) {
  const [savedNotices, setSavedNotices] = useState<FansubPinnedNotice[]>([])
  const [noticeLoading, setNoticeLoading] = useState(true)
  const [noticeSavingSlot, setNoticeSavingSlot] = useState<number | null>(null)
  const [noticeError, setNoticeError] = useState<string | null>(null)

  const [targetOptions, setTargetOptions] = useState<FansubNoticeTargetOptionMap>(() => createEmptyTargetOptionMap())
  const [targetOptionsLoading, setTargetOptionsLoading] = useState(true)
  const [targetOptionsError, setTargetOptionsError] = useState<string | null>(null)

  const [notificationForm, setNotificationForm] = useState<NotificationFormState>(() => createNotificationFormState(createEmptyTargetOptionMap()))
  const [broadcasts, setBroadcasts] = useState<FansubNotificationBroadcast[]>([])
  const [broadcastsLoading, setBroadcastsLoading] = useState(true)
  const [broadcastsError, setBroadcastsError] = useState<string | null>(null)
  const [isSendingNotification, setIsSendingNotification] = useState(false)

  const [isNoticeDialogOpen, setIsNoticeDialogOpen] = useState(false)
  const [noticeDialogMode, setNoticeDialogMode] = useState<'create' | 'edit'>('create')
  const [activeNotice, setActiveNotice] = useState<FansubPinnedNotice | null>(null)
  const [activeNoticeDraft, setActiveNoticeDraft] = useState<FansubNoticeEditorValue>(() => ({
    slotIndex: 0,
    title: '',
    body: '',
    actionTarget: DEFAULT_NOTIFICATION_TARGET,
    targetEntityId: '',
    isActive: true,
  }))

  const canManagePinnedNotice = boostSnapshot?.capabilities?.canManagePinnedNotice === true
  const canUseSpecialNotifications = boostSnapshot?.capabilities?.canUseSpecialNotifications === true
  const lockCopy = useMemo(() => resolveTierLockCopy(isBoostEnabled, 1), [isBoostEnabled])
  const notificationLockCopy = useMemo(() => resolveTierLockCopy(isBoostEnabled, 1, 'notification'), [isBoostEnabled])

  useEffect(() => {
    setNotificationForm(createNotificationFormState(createEmptyTargetOptionMap()))
  }, [fansubId])

  useEffect(() => {
    let cancelled = false

    async function loadNoticeState() {
      try {
        setNoticeLoading(true)
        setNoticeError(null)
        const rows = await listManageFansubPinnedNotices(fansubId)
        if (!cancelled) setSavedNotices(rows)
      } catch (error) {
        if (cancelled) return
        setSavedNotices([])
        setNoticeError(error instanceof Error ? error.message : txa('Duyurular yüklenemedi.'))
      } finally {
        if (!cancelled) setNoticeLoading(false)
      }
    }

    async function loadBroadcastState() {
      try {
        setBroadcastsLoading(true)
        setBroadcastsError(null)
        const rows = await listFansubSpecialNotificationBroadcasts(fansubId, 20)
        if (!cancelled) setBroadcasts(rows)
      } catch (error) {
        if (cancelled) return
        setBroadcasts([])
        setBroadcastsError(error instanceof Error ? error.message : txa('Bildirim geçmişi yüklenemedi.'))
      } finally {
        if (!cancelled) setBroadcastsLoading(false)
      }
    }

    async function loadTargetState() {
      try {
        setTargetOptionsLoading(true)
        setTargetOptionsError(null)
        const options = await loadFansubNoticeTargetOptions(fansubId)
        if (cancelled) return
        setTargetOptions(options)
        setNotificationForm((prev) => (prev.targetEntityId ? prev : createNotificationFormState(options)))
      } catch (error) {
        if (cancelled) return
        setTargetOptions(createEmptyTargetOptionMap())
        setTargetOptionsError(error instanceof Error ? error.message : txa('Duyuru hedefleri yüklenemedi.'))
      } finally {
        if (!cancelled) setTargetOptionsLoading(false)
      }
    }

    void Promise.all([loadNoticeState(), loadBroadcastState(), loadTargetState()])
    return () => { cancelled = true }
  }, [fansubId])

  const activeNoticeCount = savedNotices.filter((notice) => notice.isActive).length
  const nextAvailableSlot = findNextAvailableNoticeSlot(savedNotices)
  const selectedNotificationTarget = findNoticeTargetOption(targetOptions, notificationForm.routeTarget, notificationForm.targetEntityId)
  const isTargetMissing = (notice: FansubPinnedNotice) => !targetOptionsLoading && !targetOptionsError
    && !findNoticeTargetOption(targetOptions, notice.actionTarget, notice.targetEntityId)

  const lastBroadcast = broadcasts[0] || null
  const nowMs = Date.now()
  const cooldownRemainingMinutes = lastBroadcast
    ? Math.max(0, Math.ceil(((new Date(lastBroadcast.createdAt).getTime() + FANSUB_SPECIAL_NOTIFICATION_COOLDOWN_MINUTES * 60_000) - nowMs) / 60_000))
    : 0
  const broadcastsInLastDay = broadcasts.filter((broadcast) => {
    const createdAtMs = new Date(broadcast.createdAt).getTime()
    return Number.isFinite(createdAtMs) && nowMs - createdAtMs < 86_400_000
  }).length
  const { normalizedNotificationTitle, normalizedNotificationMessage, hasDuplicateNotificationInWindow } = buildDuplicateBroadcastMatch(
    broadcasts,
    notificationForm,
    nowMs,
    FANSUB_SPECIAL_NOTIFICATION_DUPLICATE_WINDOW_HOURS,
  )

  let notificationBlockReason: string | null = null
  if (cooldownRemainingMinutes > 0) {
    notificationBlockReason = txa('Bekleme süresi dolmadı. Yeni bildirim için {v1} bekle.', { v1: formatRelativeMinutes(cooldownRemainingMinutes) })
  } else if (broadcastsInLastDay >= FANSUB_SPECIAL_NOTIFICATION_DAILY_LIMIT) {
    notificationBlockReason = txa('Son 24 saatteki {v1} bildirim hakkını kullandın.', { v1: FANSUB_SPECIAL_NOTIFICATION_DAILY_LIMIT })
  } else if (normalizedNotificationTitle && normalizedNotificationMessage && hasDuplicateNotificationInWindow) {
    notificationBlockReason = txa('Aynı bildirim {v1} saat içinde tekrar gönderilemez.', { v1: FANSUB_SPECIAL_NOTIFICATION_DUPLICATE_WINDOW_HOURS })
  }

  const canSubmitNotification = canUseSpecialNotifications
    && !isSendingNotification
    && normalizedNotificationTitle.length > 0
    && normalizedNotificationMessage.length > 0
    && selectedNotificationTarget !== null
    && !notificationBlockReason
    && !targetOptionsLoading
    && !targetOptionsError

  const replaceNotice = (next: FansubPinnedNotice) => setSavedNotices((prev) => [...prev.filter((notice) => notice.slotIndex !== next.slotIndex), next]
    .sort((left, right) => left.slotIndex - right.slotIndex))

  const handleOpenCreateDialog = () => {
    if (nextAvailableSlot == null) {
      toast.error(txa('En fazla {v1} duyuru olabilir; birini silerek yer aç.', { v1: FANSUB_PINNED_NOTICE_MAX_COUNT }))
      return
    }
    setActiveNotice(null)
    setNoticeDialogMode('create')
    setActiveNoticeDraft(createNoticeEditorValue(targetOptions, null, nextAvailableSlot))
    setIsNoticeDialogOpen(true)
  }

  const handleOpenEditDialog = (notice: FansubPinnedNotice) => {
    setActiveNotice(notice)
    setNoticeDialogMode('edit')
    setActiveNoticeDraft(createNoticeEditorValue(targetOptions, notice, notice.slotIndex))
    setIsNoticeDialogOpen(true)
  }

  const handleNoticeSubmit = async (value: FansubNoticeEditorValue) => {
    try {
      setNoticeSavingSlot(value.slotIndex)
      const savedNotice = await upsertFansubPinnedNotice({
        fansubId,
        slotIndex: value.slotIndex,
        title: value.title,
        body: value.body,
        actionTarget: value.actionTarget,
        targetEntityId: value.targetEntityId,
        isActive: value.isActive,
      })
      replaceNotice(savedNotice)
      setIsNoticeDialogOpen(false)
      setActiveNotice(null)
      toast.success(savedNotice.isActive ? txa('Duyuru profilde yayında.') : txa('Duyuru taslak olarak kaydedildi.'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Duyuru kaydedilemedi.'))
    } finally {
      setNoticeSavingSlot(null)
    }
  }

  const handleToggle = async (notice: FansubPinnedNotice) => {
    const next = !notice.isActive
    try {
      setNoticeSavingSlot(notice.slotIndex)
      await setFansubPinnedNoticeActive(fansubId, notice.slotIndex, next)
      replaceNotice({ ...notice, isActive: next, updatedAt: new Date().toISOString() })
      toast.success(next ? txa('Duyuru yeniden yayında.') : txa('Duyuru yayından kaldırıldı.'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Duyuru durumu değiştirilemedi.'))
    } finally {
      setNoticeSavingSlot(null)
    }
  }

  const handleDelete = async (notice: FansubPinnedNotice) => {
    try {
      setNoticeSavingSlot(notice.slotIndex)
      await deleteFansubPinnedNotice(fansubId, notice.slotIndex)
      setSavedNotices((prev) => prev.filter((entry) => entry.slotIndex !== notice.slotIndex))
      toast.success(txa('Duyuru silindi.'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Duyuru silinemedi.'))
    } finally {
      setNoticeSavingSlot(null)
    }
  }

  const handleNotificationTargetChange = (nextTarget: FansubNoticeActionTarget) => {
    setNotificationForm((prev) => ({ ...prev, routeTarget: nextTarget, targetEntityId: getDefaultNoticeTargetId(targetOptions, nextTarget) }))
  }

  const handleNotificationSend = async () => {
    try {
      setIsSendingNotification(true)
      const created = await sendFansubSpecialNotification({
        fansubId,
        title: notificationForm.title,
        message: notificationForm.message,
        routeTarget: notificationForm.routeTarget,
        targetEntityId: notificationForm.targetEntityId,
      })
      setBroadcasts((prev) => [created, ...prev].slice(0, 20))
      setNotificationForm(createNotificationFormState(targetOptions))
      toast.success(txa('Bildirim {v1} takipçiye gönderildi.', { v1: created.recipientCount.toLocaleString(intlLocale()) }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Bildirim gönderilemedi.'))
    } finally {
      setIsSendingNotification(false)
    }
  }

  const slots = Array.from({ length: FANSUB_PINNED_NOTICE_MAX_COUNT }, (_, index) => savedNotices.find((notice) => notice.slotIndex === index) || null)

  return (
    <div className="flex flex-col gap-4" data-testid="studio-notices">
      <Panel
        title={txa('Profilde sabit duyurular')}
        icon={Megaphone}
        tone="amber"
        meta={txa('{v1}/{v2} yayında · okurlar fansub profilinin Duyurular sekmesinde görür', { v1: activeNoticeCount, v2: FANSUB_PINNED_NOTICE_MAX_COUNT })}
      >
        {!canManagePinnedNotice && (
          <div className="mb-4">
            <NoticeLockCard fansubId={fansubId} fansubSlug={fansubSlug} copy={lockCopy} />
          </div>
        )}
        {noticeError && <p className="mb-3 text-[13px] text-destructive">{noticeError}</p>}
        {targetOptionsError && <p className="mb-3 text-[13px] text-destructive">{targetOptionsError}</p>}

        {noticeLoading ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">{txa('Duyurular yükleniyor…')}</p>
        ) : savedNotices.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border/80 px-4 py-4 sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold">{txa('Henüz sabit duyuru yok')}</span>
              <span className="block text-[12px] text-muted-foreground">{txa('Bölüm takvimi, ara verme ya da yeni seri haberini profilinde en üste sabitle. En fazla {v1} duyuru.', { v1: FANSUB_PINNED_NOTICE_MAX_COUNT })}</span>
            </span>
            <Button type="button" className="rounded-full" onClick={handleOpenCreateDialog} disabled={!canManagePinnedNotice || targetOptionsLoading || Boolean(targetOptionsError)}>
              <Plus size={15} weight="bold" />{txa('Duyuru ekle')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {slots.map((notice, index) => notice ? (
              <NoticeSlotCard
                key={notice.id}
                notice={notice}
                targetMissing={isTargetMissing(notice)}
                busy={noticeSavingSlot === notice.slotIndex}
                canPublish={canManagePinnedNotice}
                onToggle={() => void handleToggle(notice)}
                onEdit={() => handleOpenEditDialog(notice)}
                onDelete={() => void handleDelete(notice)}
              />
            ) : (
              <button
                key={`empty-${index}`}
                type="button"
                onClick={handleOpenCreateDialog}
                disabled={!canManagePinnedNotice || targetOptionsLoading || Boolean(targetOptionsError)}
                className="flex min-h-[176px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 text-center text-muted-foreground transition-colors enabled:hover:border-primary/50 enabled:hover:text-foreground disabled:opacity-60"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-muted"><Plus size={18} weight="bold" /></span>
                <span className="text-[13px] font-bold">{txa('Duyuru ekle')}</span>
                <span className="text-[11.5px]">{txa('Slot {v1} boş', { v1: index + 1 })}</span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={txa('Takipçilere bildirim')} icon={PaperPlaneTilt} tone="primary" meta={txa('Tek seferlik; takipçilerin bildirim kutusuna düşer')} testId="studio-notifications">
        {!canUseSpecialNotifications ? (
          <div className="mb-4">
            <NoticeLockCard fansubId={fansubId} fansubSlug={fansubSlug} copy={notificationLockCopy} />
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap gap-1.5 text-[11.5px]">
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', cooldownRemainingMinutes > 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300')}>
              <Clock size={12} weight="bold" />{cooldownRemainingMinutes > 0 ? txa('{v1} sonra gönderebilirsin', { v1: formatRelativeMinutes(cooldownRemainingMinutes) }) : txa('Gönderime hazır')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">
              <ShieldCheck size={12} weight="bold" />{txa('24 saatte')}{' '}{broadcastsInLastDay}/{FANSUB_SPECIAL_NOTIFICATION_DAILY_LIMIT}
            </span>
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">
              {txa('Aynı metin {v1} saat içinde tekrar gönderilemez', { v1: FANSUB_SPECIAL_NOTIFICATION_DUPLICATE_WINDOW_HOURS })}
            </span>
          </div>
        )}

        <div className={cn('grid items-start gap-5', canUseSpecialNotifications && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
          {canUseSpecialNotifications && (
            <div className="flex flex-col gap-3.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="fansub-notification-title">{txa('Başlık')}</Label>
                  <span className="text-[11.5px] tabular-nums text-muted-foreground">{notificationForm.title.trim().length}/{FANSUB_SPECIAL_NOTIFICATION_TITLE_MAX}</span>
                </div>
                <Input
                  id="fansub-notification-title"
                  value={notificationForm.title}
                  disabled={isSendingNotification}
                  maxLength={FANSUB_SPECIAL_NOTIFICATION_TITLE_MAX}
                  onChange={(event) => setNotificationForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder={txa('Örnek: Yeni bölüm yayında')}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="fansub-notification-message">{txa('Metin')}</Label>
                  <span className="text-[11.5px] tabular-nums text-muted-foreground">{notificationForm.message.trim().length}/{FANSUB_SPECIAL_NOTIFICATION_MESSAGE_MAX}</span>
                </div>
                <Textarea
                  id="fansub-notification-message"
                  value={notificationForm.message}
                  disabled={isSendingNotification}
                  maxLength={FANSUB_SPECIAL_NOTIFICATION_MESSAGE_MAX}
                  rows={3}
                  onChange={(event) => setNotificationForm((prev) => ({ ...prev, message: event.target.value }))}
                  placeholder={txa('Kısa ve tek amaçlı olsun; okur tıklayınca seçtiğin hedefe gider.')}
                  className="rounded-xl"
                />
              </div>
              <FansubNoticeTargetSelector
                idPrefix="fansub-notification"
                target={notificationForm.routeTarget}
                targetEntityId={notificationForm.targetEntityId}
                targetOptions={targetOptions}
                loading={targetOptionsLoading}
                disabled={isSendingNotification}
                onTargetChange={handleNotificationTargetChange}
                onTargetEntityIdChange={(targetEntityId) => setNotificationForm((prev) => ({ ...prev, targetEntityId }))}
              />
              {notificationBlockReason && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-300">
                  <Clock size={14} weight="fill" className="mt-0.5 flex-none" />{notificationBlockReason}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" className="rounded-full" disabled={isSendingNotification} onClick={() => setNotificationForm(createNotificationFormState(targetOptions))}>
                  {txa('Temizle')}
                </Button>
                <Button type="button" className="rounded-full" disabled={!canSubmitNotification} onClick={() => void handleNotificationSend()}>
                  <PaperPlaneTilt size={15} />{isSendingNotification ? txa('Gönderiliyor…') : txa('Takipçilere gönder')}
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {canUseSpecialNotifications && (
              <div>
                <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{txa('Bildirimde böyle görünür')}</p>
                <div className="pointer-events-none overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm" aria-hidden="true">
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11.5px] font-bold">
                    {txa('Bildirimler')}<span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">1</span>
                  </div>
                  <div className="flex gap-2.5 bg-primary/[0.05] px-3 py-2.5">
                    <span className="flex size-8 flex-none items-center justify-center rounded-full bg-muted text-[12px] font-black text-muted-foreground">{(fansubName || 'F').slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold">{normalizeText(notificationForm.title) || txa('Bildirim başlığı')}</span>
                      <span className="line-clamp-2 text-[11.5px] text-muted-foreground">{normalizeText(notificationForm.message) || txa('Takipçilerin bu metni görür.')}</span>
                      <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{txa('{v1} · şimdi', { v1: fansubName || txa('Fansub') })}</span>
                    </span>
                    <span className="mt-1 size-2 flex-none rounded-full bg-primary" />
                  </div>
                  <div className="flex gap-2.5 px-3 py-2.5 opacity-50">
                    <span className="size-8 flex-none rounded-full bg-muted" />
                    <span className="flex flex-1 flex-col gap-1.5 pt-1"><span className="h-2 w-28 rounded-full bg-muted" /><span className="h-2 w-40 rounded-full bg-muted/70" /></span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="mb-1 text-[12px] font-semibold text-muted-foreground">{txa('Son gönderilenler')}</p>
              {broadcastsError && <p className="text-[12.5px] text-destructive">{broadcastsError}</p>}
              {broadcastsLoading ? null : !broadcasts.length ? (
                <p className="text-[12.5px] text-muted-foreground">{txa('Henüz bildirim gönderilmedi.')}</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {broadcasts.slice(0, 5).map((broadcast) => (
                    <li key={broadcast.id} className="flex items-center gap-2.5 py-2">
                      <ToneIcon icon={BellRinging} tone="primary" size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{normalizeText(broadcast.title)}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{broadcast.createdBy?.username || txa('Ekip')} · {formatRelative(broadcast.createdAt)}</span>
                      </span>
                      <span className="flex-none text-[11.5px] font-bold tabular-nums text-muted-foreground">{txa('{v1} kişi', { v1: broadcast.recipientCount.toLocaleString(intlLocale()) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <FansubNoticeComposerDialog
        open={isNoticeDialogOpen}
        onOpenChange={setIsNoticeDialogOpen}
        mode={noticeDialogMode}
        fansubId={fansubId}
        fansubSlug={fansubSlug}
        fansubName={fansubName}
        initialValue={activeNoticeDraft}
        savedNotice={activeNotice}
        isSaving={noticeSavingSlot === activeNoticeDraft.slotIndex}
        targetOptions={targetOptions}
        targetOptionsLoading={targetOptionsLoading}
        onSubmit={handleNoticeSubmit}
      />
    </div>
  )
}
