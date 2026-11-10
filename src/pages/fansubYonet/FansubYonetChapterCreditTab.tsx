import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import {
  CheckCircle2,
  Eye,
  Loader2,
  PencilLine,
  Plus,
  Save,
} from 'lucide-react'
import { LockSimple, Sparkle as Sparkles, Stack as Layers3Icon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { buildChapterCreditPresentation } from '@/components/fansub/chapterCreditPresentation'
import { canRenderFansubChapterEndCredit } from '@/lib/fansubBoostCapabilityGovernance'
import { Panel } from '@/pages/profile/ProfileTabKit'
import { resolveFansubChapterCreditFallbackCopy } from '@/lib/fansubChapterCredit'
import { buildPublicFansubPath } from '@/lib/routes'
import {
  listPublicFansubBoostSupportersPreview,
  type FansubBoostSnapshot,
  type FansubBoostSupporterPreview,
} from '@/services/fansubBoostService'
import {
  createDefaultFansubChapterCreditSettings,
  getFansubManageChapterCreditSettings,
  listFansubManageChapterCreditOverrides,
  upsertFansubChapterCreditOverride,
  upsertFansubChapterCreditSettings,
  type FansubChapterCreditOverride,
} from '@/services/fansubChapterCreditService'
import { listFansubManageChapters } from '@/services/fansubManageService'
import { toast } from '@/services/toastService'
import type { Fansub } from '@/types'
import ChapterCreditOverrideDialog from './ChapterCreditOverrideDialog'
import ChapterCreditPreviewPanel from './ChapterCreditPreviewPanel'
import { formatRelative } from './FansubYonetOverviewPanels'
import {
  CHAPTER_CREDIT_CTA_OPTIONS,
  CHAPTER_CREDIT_SUPPORTER_OPTIONS,
  buildChapterCreditOverrideInput,
  buildChapterCreditSettingsInput,
  buildChapterCreditPreviewConfig,
  createChapterCreditOverrideForm,
  createChapterCreditSettingsForm,
  formatChapterCreditOverrideLabel,
  type ChapterCreditOverrideForm,
  type ChapterCreditSettingsForm,
} from './chapterCreditHelpers'
import { txa } from '@/i18n/activeLocale'

type FansubYonetChapterCreditTabProps = {
  fansubId: string
  fansub: Fansub
  isBoostEnabled: boolean
  boostSnapshot: FansubBoostSnapshot | null
}

function resolveChapterCreditLockCopy(isBoostEnabled: boolean) {
  if (!isBoostEnabled) {
    return {
      badge: txa('Takviye kapalı'),
      description: txa('Takviye sistemi şu an site genelinde kapalı; kapanış şeridi geçici olarak kullanılamıyor.'),
    }
  }
  return {
    badge: txa('Seviye 1 takviye gerekir'),
    description: txa('Kapanış şeridi Seviye 1 takviyeyle açılır. Okurların fansubunu takviye ettikçe seviye yükselir ve şerit kendiliğinden kullanılabilir olur.'),
  }
}

const CTA_LABEL: Record<string, string> = {
  get fansub() { return txa('Fansub sayfası') },
  get takviye() { return txa('Takviye sekmesi') },
  get mangalar() { return txa('Seriler sekmesi') },
}

function serializeSettingsForm(value: ChapterCreditSettingsForm) {
  return JSON.stringify({
    isEnabled: value.isEnabled,
    title: value.title.trim(),
    body: value.body.trim(),
    ctaLabel: value.ctaLabel.trim(),
    ctaTarget: value.ctaTarget,
    showMetrics: value.showMetrics,
    showSupporters: value.showSupporters,
    maxSupporterCount: value.maxSupporterCount,
  })
}

export default function FansubYonetChapterCreditTab({
  fansubId,
  fansub,
  isBoostEnabled,
  boostSnapshot,
}: FansubYonetChapterCreditTabProps) {
  const [settingsForm, setSettingsForm] = useState<ChapterCreditSettingsForm>(
    createChapterCreditSettingsForm(createDefaultFansubChapterCreditSettings(fansubId)),
  )
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsSaveState, setSettingsSaveState] = useState<'idle' | 'saved'>('idle')
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState(() => serializeSettingsForm(
    createChapterCreditSettingsForm(createDefaultFansubChapterCreditSettings(fansubId)),
  ))

  const [overrideItems, setOverrideItems] = useState<FansubChapterCreditOverride[]>([])
  const [overrideLoading, setOverrideLoading] = useState(true)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [overrideSaving, setOverrideSaving] = useState(false)

  const [previewSupporters, setPreviewSupporters] = useState<FansubBoostSupporterPreview[]>([])
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  const [chapterOptions, setChapterOptions] = useState<Array<{ id: string; label: string }>>([])
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false)
  const [overrideDialogMode, setOverrideDialogMode] = useState<'create' | 'edit'>('create')
  const [activeOverride, setActiveOverride] = useState<FansubChapterCreditOverride | null>(null)

  // The closing strip is a Level 1 capability: runtime on + capability true is required. Otherwise
  // buildChapterCreditPresentation throws (the tab used to crash).
  const canManageChapterCredit = isBoostEnabled && canRenderFansubChapterEndCredit(boostSnapshot?.capabilities, boostSnapshot ? 'resolved' : 'unknown')
  const lockCopy = useMemo(() => resolveChapterCreditLockCopy(isBoostEnabled), [isBoostEnabled])
  const publicFansubHref = buildPublicFansubPath({ id: fansub.id, slug: fansub.slug })
  const fallbackCopy = useMemo(() => resolveFansubChapterCreditFallbackCopy(fansub.name), [fansub.name])
  const settingsSnapshot = useMemo(() => serializeSettingsForm(settingsForm), [settingsForm])
  const isSettingsDirty = settingsSnapshot !== savedSettingsSnapshot
  const saveButtonDisabled = !canManageChapterCredit || settingsSaving || settingsLoading || !isSettingsDirty

  useEffect(() => {
    let cancelled = false

    async function loadState() {
      try {
        setSettingsLoading(true)
        setOverrideLoading(true)
        setSettingsError(null)
        setOverrideError(null)

        const [settings, overrides, chapters] = await Promise.all([
          getFansubManageChapterCreditSettings(fansubId),
          listFansubManageChapterCreditOverrides(fansubId),
          listFansubManageChapters(fansubId, { page: 1, limit: 100, status: 'all' }),
        ])

        if (cancelled) return

        const nextSettingsForm = createChapterCreditSettingsForm(settings)
        setSettingsForm(nextSettingsForm)
        setSavedSettingsSnapshot(serializeSettingsForm(nextSettingsForm))
        setOverrideItems(overrides)
        setChapterOptions(
          chapters.items.map((chapter) => ({
            id: chapter.id,
            label: `${txa('{v1} · Bölüm {v2}', { v1: chapter.mangaTitle, v2: chapter.chapterNumber })}${chapter.title ? ` · ${chapter.title}` : ''}`,
          })),
        )
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : txa('Kapanış şeridi ayarları yüklenemedi.')
        setSettingsError(message)
        setOverrideError(message)
      } finally {
        if (!cancelled) {
          setSettingsLoading(false)
          setOverrideLoading(false)
        }
      }
    }

    void loadState()
    return () => { cancelled = true }
  }, [fansubId])

  useEffect(() => {
    if (settingsSaveState !== 'saved') return undefined

    const timeoutId = window.setTimeout(() => {
      setSettingsSaveState('idle')
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [settingsSaveState])

  useEffect(() => {
    if (!canManageChapterCredit) {
      setPreviewSupporters([])
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const supporters = await listPublicFansubBoostSupportersPreview(fansubId, 6)
        if (cancelled) return
        setPreviewSupporters(supporters)
      } catch (error) {
        if (cancelled) return
        console.error('[FansubYonetChapterCreditTab] preview supporters error', error)
        setPreviewSupporters([])
      }
    })()

    return () => { cancelled = true }
  }, [canManageChapterCredit, fansubId])

  const previewPresentation = useMemo(() => (canManageChapterCredit ? buildChapterCreditPresentation({
    fansub,
    config: buildChapterCreditPreviewConfig(settingsForm),
    snapshot: boostSnapshot,
    supporters: previewSupporters,
    badgeLabel: txa('Bölüm sonu'),
    eyebrowLabel: txa('Kapanış şeridi'),
  }) : null), [boostSnapshot, canManageChapterCredit, fansub, previewSupporters, settingsForm])

  const activeOverrideDraft: ChapterCreditOverrideForm = useMemo(
    () => createChapterCreditOverrideForm(activeOverride),
    [activeOverride],
  )

  const handleSaveSettings = async () => {
    try {
      setSettingsSaving(true)
      setSettingsSaveState('idle')
      const saved = await upsertFansubChapterCreditSettings(
        buildChapterCreditSettingsInput(fansubId, settingsForm),
      )
      const nextSettingsForm = createChapterCreditSettingsForm(saved)
      setSettingsForm(nextSettingsForm)
      setSavedSettingsSnapshot(serializeSettingsForm(nextSettingsForm))
      setSettingsSaveState('saved')
      toast.success(txa('Kapanış şeridi kaydedildi.'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Şablon kaydedilemedi.'))
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleSubmitOverride = async (value: ChapterCreditOverrideForm) => {
    try {
      setOverrideSaving(true)
      const saved = await upsertFansubChapterCreditOverride(
        buildChapterCreditOverrideInput(fansubId, value),
      )

      if ('overrideMode' in saved && saved.overrideMode === 'inherit') {
        setOverrideItems((prev) => prev.filter((item) => item.chapterId !== saved.chapterId))
      } else {
        setOverrideItems((prev) => {
          const next = prev.filter((item) => item.chapterId !== saved.chapterId)
          return [saved, ...next].sort((left, right) => {
            const leftTime = new Date(left.updatedAt || left.createdAt || '').getTime()
            const rightTime = new Date(right.updatedAt || right.createdAt || '').getTime()
            return rightTime - leftTime
          })
        })
      }

      setOverrideDialogOpen(false)
      setActiveOverride(null)
      toast.success(txa('Bölüme özel ayar kaydedildi.'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Bölüme özel ayar kaydedilemedi.'))
    } finally {
      setOverrideSaving(false)
    }
  }

  const handleResetOverride = async () => {
    if (!activeOverride) return

    try {
      setOverrideSaving(true)
      await upsertFansubChapterCreditOverride({
        fansubId,
        chapterId: activeOverride.chapterId,
        overrideMode: 'inherit',
      })
      setOverrideItems((prev) => prev.filter((item) => item.chapterId !== activeOverride.chapterId))
      setOverrideDialogOpen(false)
      setActiveOverride(null)
      toast.success(txa('Bölüm yeniden varsayılanı kullanıyor.'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Bölüme özel ayar kaldırılamadı.'))
    } finally {
      setOverrideSaving(false)
    }
  }

  if (!canManageChapterCredit) {
    return (
      <div className="flex flex-col gap-4" data-testid="studio-chapter-credit">
        <Panel title={txa('Kapanış şeridi kilitli')} icon={LockSimple} tone="amber" meta={lockCopy.badge}>
          <p className="text-[13px] text-muted-foreground">{lockCopy.description}</p>
          <ul className="mt-3 grid gap-2 text-[12.5px] sm:grid-cols-3">
            {[
              [txa('Teşekkür'), txa('Her bölümün sonunda okura kısa bir teşekkür notu.')],
              [txa('Sosyal kanıt'), txa('Destekçi yüzleri ve takviye seviyen görünür.')],
              [txa('Yönlendirme'), txa('Okuru fansub sayfana ya da takviye sekmesine götürür.')],
            ].map(([title, hint]) => (
              <li key={title} className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
                <b className="block text-[13px]">{title}</b>
                <span className="text-muted-foreground">{hint}</span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-4 rounded-full">
            <Link to={`${publicFansubHref}?tab=takviye`}>{txa('Takviye sayfasını aç')}</Link>
          </Button>
        </Panel>
      </div>
    )
  }

  const disabled = settingsSaving || settingsLoading

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" data-testid="studio-chapter-credit">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title={txa('Varsayılan şablon')} icon={Sparkles} tone="primary" meta={isSettingsDirty ? txa('Kaydedilmemiş değişiklik var') : txa('Güncel')}>
          {settingsError ? <p className="mb-3 text-[13px] text-destructive">{settingsError}</p> : null}
          {settingsLoading ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">{txa('Ayarlar yükleniyor…')}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 px-3.5 py-2.5">
                <span>
                  <span className="block text-[13px] font-bold">{settingsForm.isEnabled ? txa('Bölüm sonlarında gösteriliyor') : txa('Kapalı')}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{txa('Açıkken tüm yayındaki bölümlerin sonunda görünür; bölüm bazında kapatabilirsin.')}</span>
                </span>
                <Switch checked={settingsForm.isEnabled} disabled={disabled} onCheckedChange={(isEnabled) => setSettingsForm((prev) => ({ ...prev, isEnabled }))} />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="credit-title">{txa('Başlık')}</Label>
                  <Input id="credit-title" value={settingsForm.title} disabled={disabled} onChange={(event) => setSettingsForm((prev) => ({ ...prev, title: event.target.value }))} placeholder={fallbackCopy.title} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="credit-body">{txa('Metin')}</Label>
                  <Textarea id="credit-body" value={settingsForm.body} disabled={disabled} rows={3} onChange={(event) => setSettingsForm((prev) => ({ ...prev, body: event.target.value }))} placeholder={fallbackCopy.body} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="credit-cta">{txa('Düğme metni')}</Label>
                  <Input id="credit-cta" value={settingsForm.ctaLabel} disabled={disabled} onChange={(event) => setSettingsForm((prev) => ({ ...prev, ctaLabel: event.target.value }))} placeholder={fallbackCopy.ctaLabel} />
                </div>
                <div className="space-y-1.5">
                  <Label>{txa('Düğme nereye gitsin?')}</Label>
                  <Select
                    value={settingsForm.ctaTarget || '__none__'}
                    onValueChange={(value) => setSettingsForm((prev) => ({ ...prev, ctaTarget: value === '__none__' ? '' : value as ChapterCreditSettingsForm['ctaTarget'] }))}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder={txa('Hedef seç')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{txa('Düğme gösterme')}</SelectItem>
                      {CHAPTER_CREDIT_CTA_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{CTA_LABEL[option.value] || option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="-mt-2 text-[11.5px] text-muted-foreground">{txa('Boş bıraktığın alanlarda gri yazan varsayılan metin kullanılır.')}</p>

              <div className="grid gap-2 sm:grid-cols-3">
                <label className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-[12.5px]">
                  <span>{txa('Destek metrikleri')}</span>
                  <Switch checked={settingsForm.showMetrics} disabled={disabled} onCheckedChange={(showMetrics) => setSettingsForm((prev) => ({ ...prev, showMetrics }))} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-[12.5px]">
                  <span>{txa('Destekçi yüzleri')}</span>
                  <Switch checked={settingsForm.showSupporters} disabled={disabled} onCheckedChange={(showSupporters) => setSettingsForm((prev) => ({ ...prev, showSupporters }))} />
                </label>
                <Select value={settingsForm.maxSupporterCount} onValueChange={(maxSupporterCount) => setSettingsForm((prev) => ({ ...prev, maxSupporterCount }))} disabled={disabled || !settingsForm.showSupporters}>
                  <SelectTrigger className="h-auto w-full rounded-xl py-2 text-[12.5px]" aria-label={txa('Gösterilecek destekçi sayısı')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHAPTER_CREDIT_SUPPORTER_OPTIONS.map((value) => (
                      <SelectItem key={value} value={String(value)}>{txa('{v1} destekçi göster', { v1: value })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" className="rounded-full" disabled={saveButtonDisabled} onClick={() => void handleSaveSettings()}>
                  {settingsSaving ? <Loader2 className="size-4 animate-spin" /> : settingsSaveState === 'saved' ? <CheckCircle2 className="size-4" /> : <Save className="size-4" />}
                  {settingsSaving ? txa('Kaydediliyor…') : settingsSaveState === 'saved' ? txa('Kaydedildi') : txa('Kaydet')}
                </Button>
              </div>
            </div>
          )}
        </Panel>

        <Panel title={txa('Bölüme özel')} icon={Layers3Icon} tone="violet" meta={txa('Belirli bir bölümde kapat ya da o bölüme özel metin yaz')}>
          <div className="-mt-1 mb-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={overrideLoading || chapterOptions.length === 0}
              onClick={() => {
                setActiveOverride(null)
                setOverrideDialogMode('create')
                setOverrideDialogOpen(true)
              }}
            >
              <Plus className="size-4" />{txa('Bölüm seç')}
            </Button>
          </div>
          {overrideError ? <p className="mb-3 text-[13px] text-destructive">{overrideError}</p> : null}
          {overrideLoading ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">{txa('Yükleniyor…')}</p>
          ) : overrideItems.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">{txa('Tüm bölümler varsayılan şablonu kullanıyor.')}</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {overrideItems.map((item) => (
                <li key={item.chapterId} className="flex items-center gap-3 py-2">
                  <span className={item.overrideMode === 'disabled' ? 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground' : 'rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:text-violet-300'}>
                    {item.overrideMode === 'disabled' ? txa('Kapalı') : txa('Özel')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={formatChapterCreditOverrideLabel(item)}>{formatChapterCreditOverrideLabel(item)}</span>
                  <span className="hidden flex-none text-[11.5px] text-muted-foreground sm:block">{formatRelative(item.updatedAt || item.createdAt || null)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label={txa('Düzenle')}
                    onClick={() => {
                      setActiveOverride(item)
                      setOverrideDialogMode('edit')
                      setOverrideDialogOpen(true)
                    }}
                  >
                    <PencilLine className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-3 xl:sticky xl:top-4">
        {previewPresentation ? (
          <ChapterCreditPreviewPanel presentation={previewPresentation} previewMode={previewMode} onPreviewModeChange={setPreviewMode} />
        ) : null}
        <p className="flex items-start gap-2 px-1 text-[11.5px] text-muted-foreground">
          <Eye className="mt-0.5 size-3.5 flex-none" />
          {txa('Önizleme okuyucunun gördüğü şeridin aynısıdır. Takviye seviyen düşerse şerit kendiliğinden gizlenir.')}
        </p>
      </div>

      <ChapterCreditOverrideDialog
        open={overrideDialogOpen}
        onOpenChange={setOverrideDialogOpen}
        fansub={fansub}
        boostSnapshot={boostSnapshot}
        supporterPreview={previewSupporters}
        settingsForm={settingsForm}
        initialValue={activeOverrideDraft}
        chapterOptions={chapterOptions}
        saving={overrideSaving}
        mode={overrideDialogMode}
        onSubmit={handleSubmitOverride}
        onResetOverride={overrideDialogMode === 'edit' ? handleResetOverride : undefined}
      />
    </div>
  )
}
