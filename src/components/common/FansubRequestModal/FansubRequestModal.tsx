import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type UIEvent } from 'react'
import {
  FANSUB_DESCRIPTION_MAX_LENGTH,
  FANSUB_NAME_MAX_LENGTH,
  FANSUB_NAME_MIN_LENGTH,
  submitFansubRequest,
  type FansubRequest,
} from '@/services/fansubService'
import { toast } from '@/services/toastService'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { FansubRequestPreview } from './FansubRequestPreview'
import { FansubRequestStepNav } from './FansubRequestStepNav'
import {
  FansubRequestIdentityStep,
  FansubRequestPublishingStep,
  FansubRequestReviewStep,
  FansubRequestTeamStep,
} from './FansubRequestSteps'
import {
  FANSUB_AVATAR_ALLOWED_TYPES,
  FANSUB_AVATAR_MAX_BYTES,
  STEP_LABELS,
  buildFansubRequestMeta,
  createInitialFansubRequestDraft,
  splitCsv,
  type FansubRequestDraft,
  type FansubRequestStep,
} from './fansubRequestModal.shared'
import { txa } from '@/i18n/activeLocale'

interface FansubRequestModalProps {
  isOpen: boolean
  onClose: () => void
  requesterUserId: string
  onSubmitted: (request: FansubRequest) => void
}

function FansubRequestModal({
  isOpen,
  onClose,
  requesterUserId,
  onSubmitted,
}: FansubRequestModalProps) {
  const [step, setStep] = useState<FansubRequestStep>(1)
  const [draft, setDraft] = useState<FansubRequestDraft>(() => createInitialFansubRequestDraft())
  const [dmcaScrolledToEnd, setDmcaScrolledToEnd] = useState(false)
  const [dmcaExpanded, setDmcaExpanded] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dmcaScrollRef = useRef<HTMLDivElement | null>(null)

  const formProgress = useMemo(() => (step / STEP_LABELS.length) * 100, [step])

  const updateDraft = useCallback((patch: Partial<FansubRequestDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }))
  }, [])

  const resetForm = useCallback(() => {
    setStep(1)
    setDraft(createInitialFansubRequestDraft())
    setDmcaScrolledToEnd(false)
    setDmcaExpanded(false)
    setAvatarFile(null)
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    setAvatarPreviewUrl(null)
    setSaving(false)
  }, [avatarPreviewUrl])

  useEffect(() => {
    if (!isOpen) resetForm()
  }, [isOpen, resetForm])

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    }
  }, [avatarPreviewUrl])

  useEffect(() => {
    if (!dmcaExpanded) return
    const box = dmcaScrollRef.current
    if (!box) return
    const hasScrollableOverflow = box.scrollHeight > box.clientHeight + 6
    if (!hasScrollableOverflow) {
      setDmcaScrolledToEnd(true)
    }
  }, [dmcaExpanded])

  function validateStep(targetStep: FansubRequestStep) {
    const {
      name,
      description,
      focusGenresInput,
      weeklyReleaseGoal,
      contactEmail,
      contactDiscord,
      teamSize,
      dmcaAccepted,
    } = draft

    if (targetStep === 1) {
      if (name.trim().length < FANSUB_NAME_MIN_LENGTH) {
        toast.warning(txa('Fansub adı en az {v1} karakter olmalı.', { v1: FANSUB_NAME_MIN_LENGTH }))
        return false
      }
      if (name.trim().length > FANSUB_NAME_MAX_LENGTH) {
        toast.warning(txa('Fansub adı en fazla {v1} karakter olabilir.', { v1: FANSUB_NAME_MAX_LENGTH }))
        return false
      }
      if (description.trim().length > FANSUB_DESCRIPTION_MAX_LENGTH) {
        toast.warning(txa('Açıklama en fazla {v1} karakter olabilir.', { v1: FANSUB_DESCRIPTION_MAX_LENGTH }))
        return false
      }
      if (description.trim().length < 10) {
        toast.warning(txa('Lütfen en az 10 karakterlik bir açıklama yazın.'))
        return false
      }
    }

    if (targetStep === 2) {
      if (splitCsv(focusGenresInput).length === 0) {
        toast.warning(txa('En az bir odak tür seçmelisin.'))
        return false
      }
      const weeklyGoal = Number(weeklyReleaseGoal)
      if (!weeklyReleaseGoal || Number.isNaN(weeklyGoal) || weeklyGoal < 1) {
        toast.warning(txa('Haftalık hedef bölüm sayısı girilmelidir.'))
        return false
      }
      if (weeklyGoal > 100) {
        toast.warning(txa('Haftalık hedef bölüm en fazla 100 olabilir.'))
        return false
      }
    }

    if (targetStep === 3) {
      const hasContact = Boolean(contactEmail.trim() || contactDiscord.trim())
      if (!hasContact) {
        toast.warning(txa('En az bir iletişim bilgisi girmen gerekiyor.'))
        return false
      }
      if (!teamSize || Number(teamSize) < 1) {
        toast.warning(txa('Ekip büyüklüğü girmen gerekiyor.'))
        return false
      }
    }

    if (targetStep === 4 && !dmcaAccepted) {
      toast.warning(txa('Başvuru için DMCA ve telif beyanını kabul etmelisin.'))
      return false
    }

    return true
  }

  function goNextStep() {
    if (!validateStep(step)) return
    setStep((previous) => (previous < 4 ? ((previous + 1) as FansubRequestStep) : previous))
  }

  function goPrevStep() {
    setStep((previous) => (previous > 1 ? ((previous - 1) as FansubRequestStep) : previous))
  }

  function goToStep(targetStep: FansubRequestStep) {
    if (targetStep === step) return
    if (targetStep < step) {
      setStep(targetStep)
      return
    }

    for (let current = step; current < targetStep; current += 1) {
      if (!validateStep(current as FansubRequestStep)) return
    }
    setStep(targetStep)
  }

  function clearAvatarPreview() {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    setAvatarPreviewUrl(null)
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null
    if (!file) {
      setAvatarFile(null)
      clearAvatarPreview()
      return
    }

    if (!FANSUB_AVATAR_ALLOWED_TYPES.includes(file.type as (typeof FANSUB_AVATAR_ALLOWED_TYPES)[number])) {
      toast.warning(txa('Avatar JPG, PNG, WEBP veya GIF olmalı.'))
      event.target.value = ''
      return
    }

    if (file.size > FANSUB_AVATAR_MAX_BYTES) {
      toast.warning(txa('Avatar dosyası en fazla 2MB olabilir.'))
      event.target.value = ''
      return
    }

    clearAvatarPreview()
    const preview = URL.createObjectURL(file)
    setAvatarFile(file)
    setAvatarPreviewUrl(preview)
  }

  function handleDmcaScroll(event: UIEvent<HTMLDivElement>) {
    if (dmcaScrolledToEnd) return
    const target = event.currentTarget
    const reachedEnd = target.scrollTop + target.clientHeight >= target.scrollHeight - 8
    if (reachedEnd) setDmcaScrolledToEnd(true)
  }

  function handleDmcaAcceptanceChange(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked
    if (checked && !dmcaScrolledToEnd) {
      setDmcaExpanded(true)
      updateDraft({ dmcaAccepted: false })
      toast.info(txa('Onaydan önce DMCA metnini okuyup en alta inmelisin.'))
      return
    }

    updateDraft({ dmcaAccepted: checked })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    if (step !== 4) {
      goNextStep()
      return
    }

    if (!validateStep(4)) return

    setSaving(true)
    try {
      const created = await submitFansubRequest({
        requesterUserId,
        name: draft.name,
        description: draft.description,
        avatarFile,
        requestMeta: buildFansubRequestMeta(draft, new Date().toISOString()),
      })

      onSubmitted(created)
      toast.success(txa('Fansub talebiniz oluşturuldu. Admin onayından sonra aktif olacak.'))
      onClose()
      resetForm()
    } catch (error) {
      console.error('[FansubRequestModal] submit error', error)
      toast.error(error instanceof Error ? error.message : txa('Fansub talebi oluşturulamadı.'))
    } finally {
      setSaving(false)
    }
  }

  const selectBaseClasses =
    'h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70'

  const stepContent = (() => {
    if (step === 1) {
      return (
        <FansubRequestIdentityStep
          draft={draft}
          updateDraft={updateDraft}
          selectBaseClasses={selectBaseClasses}
          avatarFile={avatarFile}
          avatarPreviewUrl={avatarPreviewUrl}
          onAvatarChange={handleAvatarChange}
        />
      )
    }

    if (step === 2) {
      return (
        <FansubRequestPublishingStep
          draft={draft}
          updateDraft={updateDraft}
          selectBaseClasses={selectBaseClasses}
        />
      )
    }

    if (step === 3) {
      return (
        <FansubRequestTeamStep
          draft={draft}
          updateDraft={updateDraft}
          selectBaseClasses={selectBaseClasses}
        />
      )
    }

    return (
      <FansubRequestReviewStep
        draft={draft}
        updateDraft={updateDraft}
        selectBaseClasses={selectBaseClasses}
        avatarFile={avatarFile}
        avatarPreviewUrl={avatarPreviewUrl}
        onAvatarChange={handleAvatarChange}
        dmcaExpanded={dmcaExpanded}
        dmcaScrolledToEnd={dmcaScrolledToEnd}
        dmcaScrollRef={dmcaScrollRef}
        onDmcaExpandedChange={setDmcaExpanded}
        onDmcaScroll={handleDmcaScroll}
        onDmcaAcceptanceChange={handleDmcaAcceptanceChange}
      />
    )
  })()

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl xl:max-w-6xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle>{txa('Fansub Kurma Talebi')}</DialogTitle>
          <DialogDescription>
            {txa('Basvuru tek kayit olarak admin onayina dusmustur; onay gelmeden fansub olusturulmaz.')}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_340px]"
          onSubmit={handleSubmit}
        >
          <div className="flex min-h-0 flex-col">
            <div className="shrink-0 border-b border-border/60 px-5 py-4">
              <FansubRequestStepNav step={step} progress={formProgress} onStepClick={goToStep} />
            </div>

            <ScrollArea className="h-[min(62vh,560px)] lg:h-[calc(92vh-236px)]">
              <div className="px-5 py-4">{stepContent}</div>
            </ScrollArea>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-background px-5 py-4">
              <p className="max-w-[520px] text-xs text-muted-foreground">
                {txa('Değişiklikler kaydedildiğinde detaylı talep olarak admin paneline düşer.')}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                  {txa('İptal')}
                </Button>
                {step > 1 ? (
                  <Button type="button" variant="outline" onClick={goPrevStep} disabled={saving}>
                    {txa('Geri')}
                  </Button>
                ) : null}
                {step < 4 ? (
                  <Button type="button" onClick={goNextStep} disabled={saving}>
                    {txa('Sonraki Adım')}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={saving || !draft.dmcaAccepted}
                    className={cn(!draft.dmcaAccepted && 'opacity-70')}
                  >
                    {saving ? txa('Gönderiliyor...') : txa('Talebi Gönder')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <FansubRequestPreview draft={draft} avatarPreviewUrl={avatarPreviewUrl} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default FansubRequestModal
