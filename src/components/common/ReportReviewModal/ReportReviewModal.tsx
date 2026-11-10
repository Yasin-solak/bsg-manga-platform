import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  type Report,
  type ReportTargetContext,
  FANSUB_FIX_TARGET_TYPES,
  activateContent,
  banUser,
  deactivateContent,
  getReportDetails,
  removeReportedContentViaRpc,
  updateReportStatus,
} from '@/services/reportService'
import { toast } from '@/services/toastService'
import { confirmDialog } from '@/services/confirmService'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { AdminCommentBodyPreview } from '@/components/admin/sections/comments/AdminCommentBodyPreview'
import { Ban, Check, ExternalLink, RotateCcw, Trash2, X } from 'lucide-react'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface ReportReviewModalProps {
  isOpen: boolean
  onClose: () => void
  report: Report | null
  onStatusChange: () => void
}

function toErrorText(error: unknown, fallback: string) {
  if (!error) return fallback
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

function targetTypeLabel(targetType: Report['target_type']) {
  if (targetType === 'user') return txa('Kullanıcı')
  if (targetType === 'manga_comment') return txa('Manga Yorumu')
  if (targetType === 'manga') return txa('Manga')
  if (targetType === 'chapter') return txa('Manga Bölümü')
  return txa('Liste Yorumu')
}

function adminSectionLabel(section: ReportTargetContext['adminSection']) {
  if (section === 'users') return txa('Admin > Kullanıcılar')
  if (section === 'mangas') return txa('Admin > Manga Kontrol')
  return txa('Admin > Listeler')
}

function statusLabel(status: Report['status']) {
  if (status === 'resolved') return txa('Çözüldü')
  if (status === 'dismissed') return txa('Yoksayıldı')
  return txa('Beklemede')
}

function statusVariant(status: Report['status']) {
  if (status === 'resolved') return 'default'
  if (status === 'dismissed') return 'secondary'
  return 'destructive'
}

export function ReportReviewModal({ isOpen, onClose, report, onStatusChange }: ReportReviewModalProps) {
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState<unknown>(null)
  const [targetContext, setTargetContext] = useState<ReportTargetContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !report) return

    setContent(null)
    setTargetContext(null)
    setError(null)
    setLoading(true)

    const load = async () => {
      const { content: nextContent, context, error: loadError } = await getReportDetails(report)
      if (loadError) {
        setError(toErrorText(loadError, txa('İçerik yüklenemedi.')))
      } else {
        setContent(nextContent)
      }
      setTargetContext(context || null)
      setLoading(false)
    }

    void load()
  }, [isOpen, report])

  const activeReport = report
  if (!activeReport) return null
  const reportId = activeReport.id
  const reportTargetId = activeReport.target_id
  const reportTargetType = activeReport.target_type
  const reportReporterId = activeReport.reporter_id
  const reportReason = activeReport.reason

  const reporterName = activeReport.reporter?.username || txa('Anonim')
  const reporterAvatar =
    activeReport.reporter?.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(reporterName)}`

  const targetOwnerName = targetContext?.ownerUsername || txa('Bilinmiyor')
  const targetOwnerAvatar =
    targetContext?.ownerAvatarUrl ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(targetContext?.ownerId || 'owner')}`
  const isUserTarget = reportTargetType === 'user'
  const targetPanelTitle = isUserTarget ? txa('Şikayet Edilen Profil') : txa('Şikayet Edilen İçerik')
  const publicTargetButtonLabel = isUserTarget ? txa('Profili Aç') : txa('İçeriği Aç')

  const previewText = (() => {
    if (targetContext?.targetPreview?.trim()) return targetContext.targetPreview.trim()
    if (!content || typeof content !== 'object') return ''
    const row = content as Record<string, unknown>
    const fallback = row.body || row.content || row.description || row.text
    return typeof fallback === 'string' ? fallback : ''
  })()

  async function handleDismiss() {
    const confirmed = await confirmDialog({
      title: txa('Raporu Yoksay'),
      message: txa('Bu raporu yoksaymak istiyor musunuz?'),
      confirmText: txa('Yoksay'),
      cancelText: txa('Vazgeç'),
      variant: 'warning',
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      await updateReportStatus(reportId, 'dismissed')
      toast.info(txa('Rapor yoksayıldı.'))
      onStatusChange()
      onClose()
    } catch (actionError) {
      toast.error(toErrorText(actionError, txa('İşlem sırasında hata oluştu.')))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleResolve() {
    setActionLoading(true)
    try {
      await updateReportStatus(reportId, 'resolved')
      toast.success(txa('Rapor çözüldü olarak işaretlendi.'))
      onStatusChange()
      onClose()
    } catch (actionError) {
      toast.error(toErrorText(actionError, txa('İşlem sırasında hata oluştu.')))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDeactivate() {
    const confirmed = await confirmDialog({
      title: txa('İçeriği Deaktif Et'),
      message: txa('Hedef içeriği deaktif edip raporu çözüldüye almak istiyor musunuz?'),
      confirmText: txa('Deaktif Et'),
      cancelText: txa('Vazgeç'),
      variant: 'danger',
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      if (FANSUB_FIX_TARGET_TYPES.includes(reportTargetType)) {
        // Fansub-owned content: an atomic RPC removes the content, resolves the report,
        // opens a fix record for the fansub and sends all notifications on the server.
        await removeReportedContentViaRpc(reportId, reportReason)
        toast.success(txa('İçerik kaldırıldı, rapor çözüldü ve fansuba düzeltme görevi açıldı.'))
      } else {
        await deactivateContent(reportTargetId, reportTargetType, {
          reportId,
          reporterId: reportReporterId,
          targetOwnerId: targetContext?.ownerId,
          targetTitle: targetContext?.targetTitle,
          targetPreview: previewText,
          routeHint: targetContext?.publicUrl || targetContext?.locationPath,
          reason: reportReason,
        })
        await updateReportStatus(reportId, 'resolved')
        toast.success(txa('İçerik deaktif edildi ve rapor çözüldü.'))
      }
      onStatusChange()
      onClose()
    } catch (actionError) {
      toast.error(toErrorText(actionError, txa('İçerik deaktif edilirken hata oluştu.')))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRestore() {
    const confirmed = await confirmDialog({
      title: txa('İçeriği Geri Yükle'),
      message: txa('Bu içeriği tekrar aktif hale getirmek istiyor musunuz?'),
      confirmText: txa('Aktif Et'),
      cancelText: txa('Vazgeç'),
      variant: 'info',
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      await activateContent(reportTargetId, reportTargetType)
      toast.success(txa('İçerik tekrar aktif edildi.'))
      onClose()
    } catch (actionError) {
      toast.error(toErrorText(actionError, txa('İşlem başarısız oldu.')))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBanTargetOwner() {
    if (!targetContext?.ownerId) {
      toast.warning(txa('Hedef içerik sahibi bulunamadı.'))
      return
    }

    const ownerName = targetContext.ownerUsername || txa('Hedef kullanıcı')
    const confirmed = await confirmDialog({
      title: txa('Hedef Sahibini Banla'),
      message: txa('{v1} hesabını banlamak istiyor musunuz?', { v1: ownerName }),
      confirmText: txa('Banla'),
      cancelText: txa('Vazgeç'),
      variant: 'danger',
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      await banUser(targetContext.ownerId)
      toast.success(txa('Hedef kullanıcı banlandı.'))
    } catch (actionError) {
      toast.error(toErrorText(actionError, txa('Ban işlemi başarısız oldu.')))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBanAndResolve() {
    if (!targetContext?.ownerId) {
      toast.warning(txa('Hedef kullanıcı bulunamadı.'))
      return
    }

    const ownerName = targetContext.ownerUsername || txa('Hedef kullanıcı')
    const confirmed = await confirmDialog({
      title: txa('Kullanıcıyı Banla ve Çöz'),
      message: txa('{v1} hesabını banlayıp raporu çözüldüye almak istiyor musunuz?', { v1: ownerName }),
      confirmText: txa('Banla ve Çöz'),
      cancelText: txa('Vazgeç'),
      variant: 'danger',
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      await banUser(targetContext.ownerId)
      await updateReportStatus(reportId, 'resolved')
      toast.success(txa('Kullanıcı banlandı ve rapor çözüldü.'))
      onStatusChange()
      onClose()
    } catch (actionError) {
      toast.error(toErrorText(actionError, txa('Ban işlemi başarısız oldu.')))
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{txa('Rapor #{v1}', { v1: activeReport.id.slice(0, 8) })}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh]">
          <div className="space-y-4 px-6 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase text-muted-foreground">{txa('Rapor Nedeni')}</p>
                <p className="text-sm font-semibold text-foreground">{activeReport.reason || txa('Belirtilmedi')}</p>
                {activeReport.description ? (
                  <p className="text-xs text-muted-foreground">{activeReport.description}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(activeReport.status)}>{statusLabel(activeReport.status)}</Badge>
                <Badge variant="outline">{targetTypeLabel(activeReport.target_type)}</Badge>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">{txa('Raporlayan')}</p>
                <div className="flex items-center gap-3">
                  <img loading="lazy" decoding="async"
                    src={reporterAvatar}
                    alt={reporterName}
                    className="h-10 w-10 rounded-full border border-border object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{reporterName}</p>
                    <p className="text-xs text-muted-foreground">{new Date(activeReport.created_at).toLocaleString(intlLocale())}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">{txa('Hedef Sahip')}</p>
                <div className="flex items-center gap-3">
                  <img loading="lazy" decoding="async"
                    src={targetOwnerAvatar}
                    alt={targetOwnerName}
                    className="h-10 w-10 rounded-full border border-border object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{targetOwnerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {targetContext?.ownerId ? txa('Kullanici ID: {v1}', { v1: targetContext.ownerId.slice(0, 8) }) : txa('Kullanıcı ID yok')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">{txa('Hedefin Konumu')}</p>
              {loading ? (
                <p className="text-sm italic text-muted-foreground">{txa('Bağlam yükleniyor...')}</p>
              ) : error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : targetContext ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{targetContext.locationPath}</Badge>
                    <Badge variant="secondary">{adminSectionLabel(targetContext.adminSection)}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{targetContext.targetTitle}</p>
                    {targetContext.parentTitle ? (
                      <p className="text-xs text-muted-foreground">{txa('Üst Varlık: {v1}', { v1: targetContext.parentTitle })}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{txa('Hedef ID: {v1}', { v1: targetContext.targetId })}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {targetContext.publicUrl ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={targetContext.publicUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1.5 h-4 w-4" />
                          {publicTargetButtonLabel}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{txa('Hedef bağlamı bulunamadı.')}</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">{targetPanelTitle}</p>
              <div
                className={cn(
                  'rounded-lg border border-border bg-muted/20 p-3',
                  targetContext?.targetIsActive === false && 'opacity-60',
                )}
              >
                {targetContext?.targetIsActive === false ? (
                  <Badge variant="destructive" className="mb-2">
                    {isUserTarget ? txa('KISITLI HESAP') : txa('DEAKTİF İÇERİK')}
                  </Badge>
                ) : null}
                {previewText ? (
                  <AdminCommentBodyPreview text={previewText} size="comfortable" className="text-sm" />
                ) : (
                  <p className="text-sm text-muted-foreground">{txa('Önizleme metni yok.')}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-2">
              {activeReport.status === 'pending' ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleDismiss} disabled={actionLoading} className="flex-1">
                    <X className="mr-1.5 h-4 w-4" />
                    {txa('Yoksay')}
                  </Button>
                  {isUserTarget ? (
                    <Button variant="destructive" size="sm" onClick={handleBanAndResolve} disabled={actionLoading || targetContext?.targetIsActive === false} className="flex-1">
                      <Ban className="mr-1.5 h-4 w-4" />
                      {txa('Banla ve Çöz')}
                    </Button>
                  ) : (
                    <>
                      <Button variant="destructive" size="sm" onClick={handleDeactivate} disabled={actionLoading} className="flex-1">
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        {txa('Deaktif Et ve Çöz')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleBanTargetOwner} disabled={actionLoading} className="flex-1">
                        <Ban className="mr-1.5 h-4 w-4" />
                        {txa('Hedefi Banla')}
                      </Button>
                    </>
                  )}
                  <Button size="sm" onClick={handleResolve} disabled={actionLoading} className="flex-1">
                    <Check className="mr-1.5 h-4 w-4" />
                    {txa('Çözüldü')}
                  </Button>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>{txa('Bu rapor sonuçlandırıldı ({v1}).', { v1: statusLabel(activeReport.status) })}</span>
                  {targetContext?.targetIsActive === false && !isUserTarget ? (
                    <Button variant="outline" size="sm" onClick={handleRestore} disabled={actionLoading}>
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      {txa('İçeriği Geri Yükle')}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
