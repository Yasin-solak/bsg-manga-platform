import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  FANSUB_PINNED_NOTICE_BODY_MAX,
  FANSUB_PINNED_NOTICE_TITLE_MAX,
  type FansubNoticeActionTarget,
} from '@/lib/fansubNotices'
import type { FansubPinnedNotice } from '@/services/fansubNoticeService'
import FansubPinnedNoticeBanner from '../fansub/FansubPinnedNoticeBanner'
import FansubNoticeTargetSelector from './FansubNoticeTargetSelector'
import {
  findNoticeTargetOption,
  getDefaultNoticeTargetId,
  type FansubNoticeTargetOptionItem,
  type FansubNoticeTargetOptionMap,
} from './fansubNoticeTargetOptions'
import { txa } from '@/i18n/activeLocale'

/*
 * Notice window v2: a one-column form (title, text, target) with a live preview of the card
 * the reader sees inside a profile skeleton (on the right). The publish switch
 * sits in one place at the end of the form.
 */
export type FansubNoticeEditorValue = {
  slotIndex: number
  title: string
  body: string
  actionTarget: FansubNoticeActionTarget
  targetEntityId: string
  isActive: boolean
}

type FansubNoticeComposerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  fansubId: string
  fansubSlug?: string
  /** For the profile skeleton preview. */
  fansubName?: string
  initialValue: FansubNoticeEditorValue
  savedNotice?: FansubPinnedNotice | null
  isSaving: boolean
  /** Publishing needs a boost; if off the notice is only saved as a draft. */
  canPublish?: boolean
  targetOptions: FansubNoticeTargetOptionMap
  targetOptionsLoading?: boolean
  onSubmit: (value: FansubNoticeEditorValue) => Promise<void>
}

function buildFallbackTargetOption(notice?: FansubPinnedNotice | null): FansubNoticeTargetOptionItem | null {
  if (!notice?.targetEntityId || !notice.actionLabel || !notice.actionUrl) return null
  return {
    id: notice.targetEntityId,
    label: notice.actionLabel,
    routeHint: notice.actionUrl,
  }
}

function FieldHeader({ htmlFor, label, count, max }: { htmlFor: string, label: string, count: number, max: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={htmlFor}>{label}</Label>
      <span className={count > max * 0.9 ? 'text-[11.5px] tabular-nums text-amber-500' : 'text-[11.5px] tabular-nums text-muted-foreground'}>{count}/{max}</span>
    </div>
  )
}

export default function FansubNoticeComposerDialog({
  open,
  onOpenChange,
  mode,
  fansubId,
  fansubSlug,
  fansubName,
  initialValue,
  savedNotice = null,
  isSaving,
  canPublish = true,
  targetOptions,
  targetOptionsLoading = false,
  onSubmit,
}: FansubNoticeComposerDialogProps) {
  const [draft, setDraft] = useState<FansubNoticeEditorValue>(initialValue)

  useEffect(() => {
    if (!open) return
    setDraft(initialValue)
  }, [initialValue, open])

  const fallbackTargetOption = useMemo(() => buildFallbackTargetOption(savedNotice), [savedNotice])
  const selectedTargetOption = findNoticeTargetOption(targetOptions, draft.actionTarget, draft.targetEntityId)
    || (fallbackTargetOption && fallbackTargetOption.id === draft.targetEntityId ? fallbackTargetOption : null)

  const titleCount = draft.title.trim().length
  const bodyCount = draft.body.trim().length
  const missingFields = [
    titleCount ? null : txa('başlık'),
    bodyCount ? null : 'metin',
    selectedTargetOption ? null : 'hedef',
  ].filter(Boolean) as string[]
  const canSubmit = missingFields.length === 0 && !targetOptionsLoading && !isSaving
  const isActive = draft.isActive && canPublish

  const previewNotice: FansubPinnedNotice = {
    id: savedNotice?.id || `preview-${draft.slotIndex}`,
    fansubId,
    slotIndex: draft.slotIndex,
    title: draft.title.trim() || txa('Duyuru başlığı'),
    body: draft.body.trim() || txa('Okurların fansub profilinde göreceği kısa metin burada görünür.'),
    actionTarget: draft.actionTarget,
    targetEntityId: selectedTargetOption?.id || '',
    actionLabel: selectedTargetOption?.label || '',
    actionUrl: selectedTargetOption?.routeHint || '',
    isActive,
    createdAt: savedNotice?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(calc(100dvh-1rem),780px)] w-[min(960px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="text-lg">{mode === 'create' ? txa('Yeni duyuru') : txa('Duyuruyu düzenle')}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {txa('Slot {v1} · Fansub profilinin Duyurular sekmesinde en üstte sabit durur.', { v1: draft.slotIndex + 1 })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_400px] md:overflow-hidden">
          <div className="space-y-4 px-5 py-4 md:overflow-y-auto">
            <div className="space-y-1.5">
              <FieldHeader htmlFor="fansub-notice-dialog-title" label={txa('Başlık')} count={titleCount} max={FANSUB_PINNED_NOTICE_TITLE_MAX} />
              <Input
                id="fansub-notice-dialog-title"
                value={draft.title}
                disabled={isSaving}
                maxLength={FANSUB_PINNED_NOTICE_TITLE_MAX}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder={txa('Örnek: Bu hafta çift bölüm geliyor')}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <FieldHeader htmlFor="fansub-notice-dialog-body" label={txa('Metin')} count={bodyCount} max={FANSUB_PINNED_NOTICE_BODY_MAX} />
              <Textarea
                id="fansub-notice-dialog-body"
                value={draft.body}
                disabled={isSaving}
                maxLength={FANSUB_PINNED_NOTICE_BODY_MAX}
                rows={4}
                onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                placeholder={txa('Kısa ve net tut; ayrıntıyı bağladığın sayfa anlatsın.')}
                className="min-h-[104px] rounded-xl"
              />
            </div>

            <FansubNoticeTargetSelector
              idPrefix="fansub-notice-dialog"
              target={draft.actionTarget}
              targetEntityId={draft.targetEntityId}
              targetOptions={targetOptions}
              fallbackOption={fallbackTargetOption}
              loading={targetOptionsLoading}
              disabled={isSaving}
              onTargetChange={(nextTarget) => {
                setDraft((prev) => ({
                  ...prev,
                  actionTarget: nextTarget,
                  targetEntityId: getDefaultNoticeTargetId(targetOptions, nextTarget),
                }))
              }}
              onTargetEntityIdChange={(targetEntityId) => setDraft((prev) => ({ ...prev, targetEntityId }))}
            />

            <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3.5 py-2.5">
              <span>
                <span className="block text-[13px] font-semibold">{isActive ? txa('Kaydedince yayında') : txa('Taslak olarak kaydet')}</span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {!canPublish ? txa('Yayın için takviye gerekir.') : isActive ? txa('Okurlar profilinde hemen görür.') : txa('Yalnız ekip görür; sonra yayınlayabilirsin.')}
                </span>
              </span>
              <Switch
                checked={isActive}
                disabled={isSaving || !canPublish}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, isActive: checked }))}
              />
            </label>
          </div>

          <aside className="border-t border-border/60 bg-muted/20 px-5 py-4 md:overflow-y-auto md:border-l md:border-t-0">
            <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{txa('Profilde böyle görünür')}</p>
            <div className="pointer-events-none select-none overflow-hidden rounded-2xl border border-border/70 bg-background" aria-hidden="true">
              {/* Profil iskeleti: kapak, avatar + ad, sekmeler */}
              <div className="h-16 bg-gradient-to-r from-muted to-muted/40" />
              <div className="-mt-6 flex items-end gap-2.5 px-3">
                <span className="flex size-12 items-center justify-center rounded-2xl border-4 border-background bg-muted text-[13px] font-black text-muted-foreground">
                  {(fansubName || 'F').slice(0, 1).toUpperCase()}
                </span>
                <span className="mb-1 min-w-0">
                  <span className="block truncate text-[13px] font-bold">{fansubName || txa('Fansub')}</span>
                  <span className="mt-1 block h-1.5 w-16 rounded-full bg-muted" />
                </span>
              </div>
              <div className="mt-3 flex gap-3 border-b border-border/60 px-3 text-[11px] font-semibold text-muted-foreground">
                <span className="pb-1.5">{txa('Seriler')}</span>
                <span className="border-b-2 border-primary pb-1.5 text-foreground">{txa('Duyurular')}</span>
                <span className="pb-1.5">{txa('Takviye')}</span>
              </div>
              <div className="space-y-2 p-3">
                <FansubPinnedNoticeBanner notice={previewNotice} fansubSlug={fansubSlug} previewMode className={missingFields.length ? 'opacity-70' : undefined} />
                <span className="block h-10 rounded-xl bg-muted/60" />
                <span className="block h-10 rounded-xl bg-muted/40" />
              </div>
            </div>
            {missingFields.length ? (
              <p className="mt-2 text-[11.5px] text-muted-foreground">{txa('Eksik: {v1}', { v1: missingFields.join(', ') })}</p>
            ) : null}
          </aside>
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button type="button" variant="ghost" disabled={isSaving} onClick={() => onOpenChange(false)}>
            {txa('İptal')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            title={missingFields.length ? `Eksik: ${missingFields.join(', ')}` : undefined}
            onClick={() => void onSubmit({ ...draft, isActive })}
          >
            {isSaving ? <><Loader2 className="size-4 animate-spin" />{txa('Kaydediliyor…')}</> : mode === 'create' ? (isActive ? txa('Yayınla') : txa('Taslak kaydet')) : txa('Kaydet')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
