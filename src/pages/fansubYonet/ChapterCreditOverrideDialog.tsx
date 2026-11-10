import { useEffect, useMemo, useState } from 'react'
import { Eye, Layers3, Loader2, Settings2, Slash } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import ChapterEndCreditRail from '@/components/fansub/ChapterEndCreditRail'
import { buildChapterCreditPresentation } from '@/components/fansub/chapterCreditPresentation'
import type { FansubBoostSnapshot, FansubBoostSupporterPreview } from '@/services/fansubBoostService'
import type { Fansub } from '@/types'
import {
  CHAPTER_CREDIT_CTA_OPTIONS,
  buildChapterCreditPreviewConfig,
  createChapterCreditOverrideForm,
  type ChapterCreditOverrideForm,
  type ChapterCreditSettingsForm,
  type ChapterCreditToggleMode,
} from './chapterCreditHelpers'
import { txa } from '@/i18n/activeLocale'

type ChapterCreditOverrideDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fansub: Fansub
  boostSnapshot: FansubBoostSnapshot | null
  supporterPreview: FansubBoostSupporterPreview[]
  settingsForm: ChapterCreditSettingsForm
  initialValue: ChapterCreditOverrideForm
  chapterOptions: Array<{
    id: string
    label: string
  }>
  saving: boolean
  mode: 'create' | 'edit'
  onSubmit: (value: ChapterCreditOverrideForm) => Promise<void>
  onResetOverride?: () => Promise<void>
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      className="rounded-full"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function ToggleModeRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: ChapterCreditToggleMode
  onChange: (value: ChapterCreditToggleMode) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        <ModeButton active={value === 'inherit'} onClick={() => onChange('inherit')}>
          {txa('Varsayilan')}
        </ModeButton>
        <ModeButton active={value === 'show'} onClick={() => onChange('show')}>
          {txa('Goster')}
        </ModeButton>
        <ModeButton active={value === 'hide'} onClick={() => onChange('hide')}>
          {txa('Gizle')}
        </ModeButton>
      </div>
    </div>
  )
}

export default function ChapterCreditOverrideDialog({
  open,
  onOpenChange,
  fansub,
  boostSnapshot,
  supporterPreview,
  settingsForm,
  initialValue,
  chapterOptions,
  saving,
  mode,
  onSubmit,
  onResetOverride,
}: ChapterCreditOverrideDialogProps) {
  const [draft, setDraft] = useState<ChapterCreditOverrideForm>(initialValue)
  const hasSelectedChapter = Boolean(draft.chapterId)

  useEffect(() => {
    if (!open) return
    setDraft(createChapterCreditOverrideForm(null))
    setDraft(initialValue)
  }, [initialValue, open])

  const previewPresentation = useMemo(() => {
    if (!hasSelectedChapter || draft.overrideMode === 'disabled') return null

    const previewConfig = buildChapterCreditPreviewConfig(settingsForm, draft)
    return buildChapterCreditPresentation({
      fansub,
      config: previewConfig,
      snapshot: boostSnapshot,
      supporters: supporterPreview,
      badgeLabel: txa('Bolum sonu'),
      eyebrowLabel: txa('Kapanis seridi'),
    })
  }, [boostSnapshot, draft, fansub, hasSelectedChapter, settingsForm, supporterPreview])

  const canSubmit = Boolean(draft.chapterId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,960px)] max-w-[960px] overflow-hidden border-border/70 bg-background p-0 sm:max-w-[960px]">
        <div className="grid max-h-[min(calc(100dvh-2rem),720px)] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {txa('Bolum override')}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {mode === 'create' ? txa('Yeni kayit') : txa('Duzenleme')}
              </Badge>
            </div>
            <DialogTitle className="text-xl">{txa('Bolum bazli kapanis kredisi')}</DialogTitle>
            <DialogDescription className="max-w-2xl">
              {txa('Varsayilan sablonu kullan, bu bolumde kapat veya o bolum icin ozel bir varyant olustur.')}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-5 py-4 pb-8">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Layers3 className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">{txa('Hedef bolum')}</h3>
                  </div>

                  <div className="space-y-2">
                    <Label>{txa('Bolum sec')}</Label>
                    <Select
                      value={draft.chapterId}
                      onValueChange={(chapterId) => setDraft((prev) => ({ ...prev, chapterId }))}
                      disabled={saving || mode === 'edit'}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={txa('Bolum sec')} />
                      </SelectTrigger>
                      <SelectContent>
                        {chapterOptions.map((chapter) => (
                          <SelectItem key={chapter.id} value={chapter.id}>
                            {chapter.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Settings2 className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">{txa('Override modu')}</h3>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ModeButton
                      active={draft.overrideMode === 'custom'}
                      onClick={() => setDraft((prev) => ({ ...prev, overrideMode: 'custom' }))}
                    >
                      {txa('Ozel varyant')}
                    </ModeButton>
                    <ModeButton
                      active={draft.overrideMode === 'disabled'}
                      onClick={() => setDraft((prev) => ({ ...prev, overrideMode: 'disabled' }))}
                    >
                      {txa('Bu bolumde gizle')}
                    </ModeButton>
                  </div>

                  {draft.overrideMode === 'disabled' ? (
                    <div className="mt-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                      {txa('Bu bolum yorumlardan once kapanis seridini gostermez.')}
                    </div>
                  ) : null}
                </section>

                {draft.overrideMode === 'custom' ? (
                  <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">{txa('Ozel icerik')}</h3>
                      <p className="text-xs text-muted-foreground">
                        {txa('Bos birakilan alanlar fansub varsayilanindan gelir.')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>{txa('Baslik')}</Label>
                      <Input
                        value={draft.title}
                        onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder={txa('Varsayilani kullanmak icin bos birak')}
                        disabled={saving}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{txa('Aciklama')}</Label>
                      <Textarea
                        value={draft.body}
                        onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                        placeholder={txa('Varsayilani kullanmak icin bos birak')}
                        rows={4}
                        disabled={saving}
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{txa('CTA metni')}</Label>
                        <Input
                          value={draft.ctaLabel}
                          onChange={(event) => setDraft((prev) => ({ ...prev, ctaLabel: event.target.value }))}
                          placeholder={txa('Varsayilani kullan')}
                          disabled={saving}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{txa('CTA hedefi')}</Label>
                        <Select
                          value={draft.ctaTarget || '__inherit__'}
                          onValueChange={(value) => {
                            setDraft((prev) => ({
                              ...prev,
                              ctaTarget: value === '__inherit__' ? '' : value as ChapterCreditOverrideForm['ctaTarget'],
                            }))
                          }}
                          disabled={saving}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={txa('Varsayilan hedef')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__inherit__">{txa('Varsayilan hedef')}</SelectItem>
                            {CHAPTER_CREDIT_CTA_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4 md:grid-cols-2">
                      <ToggleModeRow
                        label={txa('Metrikler')}
                        value={draft.showMetricsMode}
                        onChange={(showMetricsMode) => setDraft((prev) => ({ ...prev, showMetricsMode }))}
                      />
                      <ToggleModeRow
                        label={txa('Supporter ozeti')}
                        value={draft.showSupportersMode}
                        onChange={(showSupportersMode) => setDraft((prev) => ({ ...prev, showSupportersMode }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{txa('Gorunen supporter sayisi')}</Label>
                      <Select
                        value={draft.maxSupporterCount || '__inherit__'}
                        onValueChange={(value) => setDraft((prev) => ({
                          ...prev,
                          maxSupporterCount: value === '__inherit__' ? '' : value,
                        }))}
                        disabled={saving || draft.showSupportersMode === 'hide'}
                      >
                        <SelectTrigger className="w-full md:max-w-[220px]">
                          <SelectValue placeholder={txa('Varsayilan limit')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__inherit__">{txa('Varsayilan limit')}</SelectItem>
                          <SelectItem value="1">{txa('1 supporter')}</SelectItem>
                          <SelectItem value="2">{txa('2 supporter')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </section>
                ) : null}
              </div>

              <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
                <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <Eye className="size-3.5 text-muted-foreground" />
                    <h3 className="text-sm font-medium text-foreground">{txa('Public preview')}</h3>
                  </div>

                  {!hasSelectedChapter ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/[0.1] px-3 py-3.5 text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">{txa('Preview icin once bolum sec')}</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {txa('Hedef bolum secildiginde yorumlardan onceki public gorunumu burada goreceksin.')}
                      </p>
                    </div>
                  ) : draft.overrideMode === 'disabled' ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/[0.1] px-3 py-3.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <Slash className="size-4 text-muted-foreground" />
                        {txa('Bu bolumde modul gizli')}
                      </div>
                      <p className="mt-1 text-xs leading-5">
                        {txa('Yorum alanindan once kapanis seridi render edilmez.')}
                      </p>
                    </div>
                  ) : previewPresentation ? (
                    <div className="rounded-2xl border border-white/10 bg-[#0b0b0f] p-3">
                      <ChapterEndCreditRail presentation={previewPresentation} compact />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/[0.12] px-3.5 py-4 text-sm text-muted-foreground">
                      {txa('Preview hazir degil.')}
                    </div>
                  )}
                </section>
              </aside>
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 px-5 py-3">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {mode === 'edit' && onResetOverride ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => void onResetOverride()}
                >
                  {txa('Override\'i kaldir')}
                </Button>
              ) : <span />}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                  {txa('Iptal')}
                </Button>
                <Button
                  type="button"
                  disabled={!canSubmit || saving}
                  onClick={() => void onSubmit(draft)}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {txa('Kaydediliyor...')}
                    </>
                  ) : (
                    txa('Override kaydet')
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
