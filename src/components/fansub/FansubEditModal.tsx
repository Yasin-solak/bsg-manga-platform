import { useMemo, useState, type ChangeEvent, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { FrameType } from '@components/common/AvatarFrame'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FansubHoverCardSurface } from '@/components/common/FansubHoverCardSurface'
import { ProfileThemePicker } from '@/pages/profile/ProfileThemePicker'
import { UserNameStyleStudio } from '@/pages/profile/UserNameStyleStudio'
import { DEFAULT_FANSUB_NAME_FX, type FansubNameFx } from '@/pages/fansub/fansubNameStyle'
import { BoostLinkState, StoreLinkState } from '@/components/fansub/FansubEditLockStates'
import { PreviewActionButton, PreviewUploadPanel } from '@/components/fansub/FansubEditModalPrimitives'
import { BadgePickerCard } from '@/components/common/cosmeticPickerCards'
import ProfileEditFrameCard from '@/pages/profile/ProfileEditFrameCard'
import ProfileEditProfileEffectCard from '@/pages/profile/ProfileEditProfileEffectCard'
import FansubVanityUrlSection from '@/components/fansub/FansubVanityUrlSection'
import { resolveFansubBackgroundAccess } from '@/lib/fansubBoostCapabilityGovernance'
import { cn } from '@/lib/utils'
import type { StoreItem, StoreProfileEffectAssets } from '@/data/storeProducts'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
} from '@/data/nameTextEffects'
import {
  buildFansubEditPreview,
  buildFansubPreviewDisplayedBadges,
  FANSUB_EDIT_AVATAR_MAX_SIZE_MB,
  FANSUB_EDIT_BACKGROUND_ACCEPT,
  FANSUB_EDIT_BACKGROUND_MAX_SIZE_MB,
  FANSUB_EDIT_DESCRIPTION_MAX_LENGTH,
} from '@/pages/fansub/fansubEditForm'
import { buildFansubNameDisplayStyle } from '@/pages/fansub/fansubHeroStandards'
import { FANSUB_SHOWCASE_HEIGHT_PX, FANSUB_SHOWCASE_WIDTH_PX } from '@/pages/fansub/FansubShowcaseHero'
import type {
  ExtendedFansub,
  FansubEditDraft,
  FansubEditModalTab,
  FansubOwnedBackground,
  OwnedFrameInfo,
} from '@/pages/fansub/types'
import type { FansubBadge } from '@/services/badgeService'
import { BadgeCheck, ImagePlus, LayoutTemplate, Palette, PenLine, Sparkles, Type, Upload, X, Zap } from 'lucide-react'
import { DiscordLogo } from '@phosphor-icons/react'
import { txa } from '@/i18n/activeLocale'

type NavSection = { description: string; icon: ReactNode; id: FansubEditModalTab; title: string }

const NAV_GROUPS: Array<{ label: string; sections: NavSection[] }> = [
  {
    get label() { return txa('Kimlik') },
    sections: [
      { id: 'profil', get title() { return txa('Profil') }, get description() { return txa('Aciklama ve baglantilar') }, icon: <PenLine className="size-4" /> },
    ],
  },
  {
    get label() { return txa('Gorunum') },
    sections: [
      { id: 'fansubTemasi', get title() { return txa('Profil Teması') }, get description() { return txa('Renk, sahne stili ve desen') }, icon: <Palette className="size-4" /> },
      { id: 'metinAnimasyonlari', get title() { return txa('İsim Stili') }, get description() { return txa('Font, renk, efekt ve hareket') }, icon: <Type className="size-4" /> },
      { id: 'cerceveler', get title() { return txa('Cerceveler') }, get description() { return txa('Avatar cercevesi') }, icon: <LayoutTemplate className="size-4" /> },
      { id: 'profilEfektleri', get title() { return txa('Profil Efektleri') }, get description() { return txa('Overlay efektleri') }, icon: <Sparkles className="size-4" /> },
    ],
  },
  {
    get label() { return txa('Topluluk') },
    sections: [
      { id: 'rozetler', get title() { return txa('Rozetler') }, get description() { return txa('Vitrin rozet sirasi') }, icon: <BadgeCheck className="size-4" /> },
    ],
  },
]

const ALL_SECTIONS = NAV_GROUPS.flatMap((group) => group.sections)

const FANSUB_EDIT_BACKGROUND_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
const FANSUB_EDIT_BACKGROUND_VIDEO_ACCEPT = 'video/webm,video/mp4'

const PREVIEW_SCALE = 0.92
const PREVIEW_WIDTH_PX = Math.round(FANSUB_SHOWCASE_WIDTH_PX * PREVIEW_SCALE)
const PREVIEW_HEIGHT_PX = Math.round(FANSUB_SHOWCASE_HEIGHT_PX * PREVIEW_SCALE)

export interface FansubEditModalProps {
  avatarSelectionLabel: string | null
  backgroundSelectionLabel: string | null
  activeProfileEffectAssets?: StoreProfileEffectAssets | null
  activeProfileEffectId?: string | null
  boostSnapshot?: FansubBoostSnapshot | null
  editDraft: FansubEditDraft
  editModalTab: FansubEditModalTab
  effectiveBg: FansubOwnedBackground | null
  effectiveBgId: string | undefined
  effectiveCustomFrameUrl?: string
  effectivePosterFrameUrl?: string
  effectiveFrame: FrameType
  failedVideoUrls: Set<string>
  fansub: ExtendedFansub
  fansubHeaderNameClassName?: string
  fansubHeaderNameInlineStyle?: CSSProperties
  followersCount: number
  hasPendingAvatarUpload: boolean
  hasPendingBackgroundUpload: boolean
  hasNameTextAccess: boolean
  hasVanityUrlAccess: boolean
  handleAvatarFile: (e: ChangeEvent<HTMLInputElement>) => void
  handleBackgroundFile: (e: ChangeEvent<HTMLInputElement>) => void
  isOpen: boolean
  isBoostEnabled?: boolean
  markVideoAsFailed: (url: string) => void
  membersCount: number
  onAvatarSelectionReset: () => void
  onBackgroundSelectionReset: () => void
  onClose: () => void
  onOpenBoost?: () => void
  onSave: () => void
  onSelectedNameColorChange: (colorId: NameTextColorId) => void
  onSelectedNameColorSlotChange: (slot: 'primary' | 'secondary') => void
  onSelectedNameEffectChange: (effectId: NameTextEffectId) => void
  onSelectedNameFontChange: (fontId: NameTextFontId) => void
  onSelectedNameSecondaryColorChange: (colorId: NameTextColorId) => void
  /** Isim stili v2: hareket + dolgu + efekt rengi. */
  onSelectedNameFxChange: (value: FansubNameFx) => void
  ownedBackgrounds: FansubOwnedBackground[]
  ownedProfileEffects: StoreItem[]
  ownedBadges: FansubBadge[]
  ownedFrameInfos: OwnedFrameInfo[]
  ownedFrames: string[]
  rawFrame: string
  saving: boolean
  uploadProgressLabel: string | null
  uploadProgressPercent: number | null
  selectedBadgeIds: string[]
  selectedNameColorId: NameTextColorId
  selectedNameColorSlot: 'primary' | 'secondary'
  selectedNameEffectId: NameTextEffectId
  selectedNameFontId: NameTextFontId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameFx: FansubNameFx
  selectedNameStyleInlineStyle?: CSSProperties
  setEditModalTab: (tab: FansubEditModalTab) => void
  setEquippedBackground: (bg: FansubOwnedBackground) => void
  setEquippedFrame: (frame: string) => void
  setEquippedProfileEffectId: (effectId: string) => void
  setSelectedBadgeIds: Dispatch<SetStateAction<string[]>>
  updateEditDraft: (patch: Partial<FansubEditDraft>) => void
}

type PreviewTool = 'avatar' | 'background'

function SectionHeader({ section }: { section: NavSection }) {
  return (
    <header className="mb-4">
      <h2 className="m-0 text-base font-black text-foreground">{section.title}</h2>
      <p className="m-0 mt-1 text-xs text-muted-foreground">{section.description}</p>
      <div className="mt-3 h-px bg-border/40" />
    </header>
  )
}

export default function FansubEditModal({
  avatarSelectionLabel,
  backgroundSelectionLabel,
  activeProfileEffectAssets,
  activeProfileEffectId,
  boostSnapshot,
  editDraft,
  editModalTab,
  effectiveBg,
  effectiveBgId,
  effectiveCustomFrameUrl,
  effectivePosterFrameUrl,
  effectiveFrame,
  failedVideoUrls,
  fansub,
  fansubHeaderNameClassName,
  followersCount,
  hasPendingAvatarUpload,
  hasPendingBackgroundUpload,
  hasNameTextAccess,
  hasVanityUrlAccess,
  handleAvatarFile,
  handleBackgroundFile,
  isOpen,
  isBoostEnabled = false,
  markVideoAsFailed,
  membersCount,
  onAvatarSelectionReset,
  onBackgroundSelectionReset,
  onClose,
  onOpenBoost,
  onSave,
  onSelectedNameColorChange,
  onSelectedNameColorSlotChange,
  onSelectedNameEffectChange,
  onSelectedNameFontChange,
  onSelectedNameSecondaryColorChange,
  onSelectedNameFxChange,
  ownedBackgrounds,
  ownedBadges,
  ownedProfileEffects,
  ownedFrameInfos,
  ownedFrames,
  rawFrame,
  saving,
  uploadProgressLabel,
  uploadProgressPercent,
  selectedBadgeIds,
  selectedNameColorId,
  selectedNameColorSlot,
  selectedNameEffectId,
  selectedNameFontId,
  selectedNameSecondaryColorId,
  selectedNameFx,
  selectedNameStyleInlineStyle,
  setEditModalTab,
  setEquippedBackground,
  setEquippedFrame,
  setEquippedProfileEffectId,
  setSelectedBadgeIds,
  updateEditDraft,
}: FansubEditModalProps) {
  const [activePreviewTool, setActivePreviewTool] = useState<PreviewTool | null>(null)
  const previewFansub = buildFansubEditPreview(fansub, editDraft)
  const previewOwnedBadges = buildFansubPreviewDisplayedBadges(ownedBadges, selectedBadgeIds)
  const activeSection = ALL_SECTIONS.find((section) => section.id === editModalTab) ?? ALL_SECTIONS[0]
  const displayedBackgrounds = effectiveBg && !ownedBackgrounds.some((background) => background.id === effectiveBg.id)
    ? [effectiveBg, ...ownedBackgrounds]
    : ownedBackgrounds
  const backgroundAccess = resolveFansubBackgroundAccess(boostSnapshot?.capabilities)
  const hasHoverThemeAccess = boostSnapshot?.capabilities?.canUseHoverTheme === true
  const canUploadStaticBackground = backgroundAccess.canUseStaticBackground
  const canUploadVideoBackground = backgroundAccess.canUseVideoBackground
  const canManageBackgroundSurface = backgroundAccess.canManageAnyBackground
  const backgroundAccept = canUploadVideoBackground
    ? (canUploadStaticBackground ? FANSUB_EDIT_BACKGROUND_ACCEPT : FANSUB_EDIT_BACKGROUND_VIDEO_ACCEPT)
    : FANSUB_EDIT_BACKGROUND_IMAGE_ACCEPT
  const selectableBackgrounds = displayedBackgrounds.filter((background) => (
    background.mediaType === 'video' ? canUploadVideoBackground : canUploadStaticBackground
  ))
  const selectedNamePreviewInlineStyle = buildFansubNameDisplayStyle(selectedNameStyleInlineStyle)

  // Background + badge mappings for the single preview (hover card surface)
  const hoverPreviewBackgroundRef = effectiveBg
    ? (resolveStoreAssetUrl(effectiveBg.posterBackground || effectiveBg.background) || effectiveBg.posterBackground || effectiveBg.background || '')
    : ''
  const hoverPreviewVideoUrl = effectiveBg?.videoUrl && !failedVideoUrls.has(effectiveBg.videoUrl)
    ? (resolveStoreAssetUrl(effectiveBg.videoUrl) || effectiveBg.videoUrl)
    : undefined
  const hoverPreviewBackgroundStyle = !effectiveBg || hoverPreviewVideoUrl
    ? undefined
    : /^(https?:|data:|blob:|\/)/i.test(hoverPreviewBackgroundRef)
      ? `url("${hoverPreviewBackgroundRef}") center / cover no-repeat`
      : hoverPreviewBackgroundRef
  const hoverPreviewBadges = previewOwnedBadges
    .filter((badge) => badge.is_displayed)
    .sort((a, b) => a.display_order - b.display_order)
    .slice(0, 3)
    .map((badge) => ({
      id: badge.badge_id,
      name: badge.badge?.name || txa('Rozet'),
      imageUrl: resolveStoreAssetUrl(badge.badge?.image_url || '') || badge.badge?.image_url || '/badges/default.png',
      ...(badge.badge?.rarity ? { rarity: badge.badge.rarity } : {}),
    }))
  const previewProfileEffectAssets = useMemo(() => {
    if (activeProfileEffectId) {
      const selectedEffect = ownedProfileEffects.find((effect) => effect.id === activeProfileEffectId)
      if (selectedEffect?.profileEffectAssets) return selectedEffect.profileEffectAssets
    }
    return activeProfileEffectAssets || null
  }, [activeProfileEffectAssets, activeProfileEffectId, ownedProfileEffects])
  const activeProfileEffect = ownedProfileEffects.find((effect) => effect.id === activeProfileEffectId) ?? null
  const activeFrameInfo = ownedFrameInfos.find((frame) => frame.identifier === rawFrame)
  const activeFrameTitle = activeFrameInfo?.name || (rawFrame === 'default' ? txa('Varsayilan cerceve') : txa('Cerceve'))
  void membersCount

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setActivePreviewTool(null)
          onClose()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="block h-screen max-h-screen w-screen max-w-none overflow-hidden rounded-none border-none bg-background p-0 shadow-none sm:max-w-none sm:rounded-none"
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Ust bar */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-4 py-3 lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label={txa('Kapat')}
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
              <div className="min-w-0">
                <DialogTitle className="truncate text-[15px] font-black tracking-tight">{txa('Fansub Studyosu')}</DialogTitle>
                <DialogDescription className="hidden truncate text-xs text-muted-foreground/80 sm:block">
                  {txa('Fansub vitrini ve gorsel kimligini tek akista duzenle.')}
                </DialogDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {saving && uploadProgressPercent !== null ? (
                <div className="hidden items-center gap-2 md:flex">
                  <span className="text-[11px] text-muted-foreground">{uploadProgressLabel || txa('Yukleniyor')}</span>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, uploadProgressPercent))}%` }} />
                  </div>
                </div>
              ) : (
                <span className="hidden text-[11px] text-muted-foreground/60 md:block">{txa('Degisiklikler kaydet\'e basilinca uygulanir')}</span>
              )}
              <Button variant="ghost" onClick={onClose} disabled={saving} className="rounded-full px-4">{txa('Iptal')}</Button>
              <Button onClick={onSave} disabled={saving} className="rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">
                {saving ? txa('Kaydediliyor...') : txa('Kaydet')}
              </Button>
            </div>
          </div>

          {/* Govde: sol nav + orta icerik + sag onizleme */}
          <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[224px_minmax(0,1fr)_minmax(0,392px)]">
            {/* SOL: Gruplu navigasyon */}
            <nav className="hidden min-h-0 flex-col overflow-y-auto border-r border-border/40 px-3 py-4 lg:flex" aria-label={txa('Duzenleme bolumleri')}>
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="mb-1.5 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.sections.map((section) => {
                      const isActive = editModalTab === section.id
                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => setEditModalTab(section.id)}
                          disabled={saving}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150',
                            isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                          )}
                        >
                          <span className="shrink-0">{section.icon}</span>
                          <span className="truncate text-[13px] font-bold">{section.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* ORTA: Tek scroll icerik */}
            <div className="flex min-h-0 flex-col">
              {/* Mobil sekme cipleri */}
              <div className="shrink-0 overflow-x-auto border-b border-border/40 px-4 py-2.5 lg:hidden">
                <div className="flex w-max gap-1.5">
                  {ALL_SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setEditModalTab(section.id)}
                      disabled={saving}
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors',
                        editModalTab === section.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {section.icon}
                      <span>{section.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div
                  key={editModalTab}
                  className="mx-auto w-full max-w-[780px] animate-in fade-in slide-in-from-bottom-1 px-4 py-5 duration-200 lg:px-8"
                >
                  <SectionHeader section={activeSection} />

                  {editModalTab === 'profil' ? (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label htmlFor="fansub-edit-desc" className="text-sm font-semibold text-foreground">{txa('Hakkinda')}</label>
                        <Textarea
                          id="fansub-edit-desc"
                          rows={5}
                          value={editDraft.description}
                          onChange={(event) => updateEditDraft({ description: event.target.value.slice(0, FANSUB_EDIT_DESCRIPTION_MAX_LENGTH) })}
                          placeholder={txa('Fansub hakkinda kisa ama net bir aciklama yaz.')}
                          className="min-h-[120px] resize-none break-all whitespace-pre-wrap [overflow-wrap:anywhere]"
                          disabled={saving}
                        />
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{txa('Bu metin fansub vitrininin hakkinda alaninda gorunur.')}</span>
                          <span>{editDraft.description.length}/{FANSUB_EDIT_DESCRIPTION_MAX_LENGTH}</span>
                        </div>
                      </div>

                      <div className="space-y-3 border-t border-border/40 pt-5">
                        <div>
                          <h3 className="m-0 text-sm font-black text-foreground">{txa('Dis baglantilar')}</h3>
                          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{txa('Fansub vitrininde gorunecek davet baglantisi.')}</p>
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2">
                            <label htmlFor="fansub-edit-discord" className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border/60 text-foreground/85" title={txa('Discord')} aria-label={txa('Discord')}>
                              <span aria-hidden="true"><DiscordLogo weight="fill" className="size-4" /></span>
                            </label>
                            <Input
                              id="fansub-edit-discord"
                              type="text"
                              value={editDraft.discordInviteUrl}
                              onChange={(event) => updateEditDraft({ discordInviteUrl: event.target.value })}
                              placeholder="https://discord.gg/ornek"
                              aria-label={txa('Discord davet baglantisi')}
                              disabled={saving}
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-border/40 pt-5">
                        <FansubVanityUrlSection
                          disabled={saving}
                          hasAccess={hasVanityUrlAccess}
                          lastChangedAt={fansub.vanitySlugChangedAt}
                          onChange={(value) => updateEditDraft({ slug: value })}
                          onOpenBoost={onOpenBoost}
                          value={editDraft.slug}
                        />
                      </div>
                    </div>
                  ) : editModalTab === 'fansubTemasi' ? (
                    <ProfileThemePicker
                      value={hasHoverThemeAccess ? editDraft.hoverTheme : null}
                      onChange={(value) => updateEditDraft({ hoverTheme: value })}
                      disabled={saving}
                      hasAccess={hasHoverThemeAccess}
                      previewName={fansub.name}
                      lockedSlot={(
                        <BoostLinkState
                          onOpenBoost={onOpenBoost}
                          text={txa('Fansub temasi takviye yerlesimiyle acilir. Capability aktif degilse secili tema korunur ama publicte varsayilan gorunum kullanilir.')}
                        />
                      )}
                    />
                  ) : editModalTab === 'metinAnimasyonlari' ? (
                    <UserNameStyleStudio
                      disabled={saving}
                      hasAccess={hasNameTextAccess}
                      lockedState={(
                        <BoostLinkState
                          onOpenBoost={onOpenBoost}
                          text={txa('Fansub isim stili takviye yerleşimiyle açılır. Takviye bittiğinde seçimin silinmez; yeniden açılınca adın yine böyle görünür.')}
                        />
                      )}
                      previewText={fansub.name}
                      theme={hasHoverThemeAccess ? editDraft.hoverTheme : null}
                      value={{
                        fontId: selectedNameFontId,
                        effectId: selectedNameEffectId,
                        colorId: selectedNameColorId,
                        secondaryColorId: selectedNameSecondaryColorId,
                        ...selectedNameFx,
                      }}
                      onChange={(patch) => {
                        if (patch.fontId) onSelectedNameFontChange(patch.fontId)
                        if (patch.effectId) onSelectedNameEffectChange(patch.effectId)
                        if (patch.colorId) onSelectedNameColorChange(patch.colorId)
                        if (patch.secondaryColorId) onSelectedNameSecondaryColorChange(patch.secondaryColorId)
                        if (patch.motionId || patch.fillId || patch.fxTint || patch.fxColors) {
                          onSelectedNameFxChange({
                            motionId: patch.motionId ?? selectedNameFx.motionId,
                            fillId: patch.fillId ?? selectedNameFx.fillId,
                            fxTint: patch.fxTint ?? selectedNameFx.fxTint,
                            fxColors: patch.fxColors ?? selectedNameFx.fxColors,
                          })
                        }
                      }}
                      onReset={() => {
                        onSelectedNameFontChange(DEFAULT_NAME_TEXT_FONT_ID)
                        onSelectedNameEffectChange(DEFAULT_NAME_TEXT_EFFECT_ID)
                        onSelectedNameColorChange(DEFAULT_NAME_TEXT_COLOR_ID)
                        onSelectedNameSecondaryColorChange(DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID)
                        onSelectedNameFxChange(DEFAULT_FANSUB_NAME_FX)
                        onSelectedNameColorSlotChange('primary')
                      }}
                      colorSlot={selectedNameColorSlot}
                      onColorSlotChange={onSelectedNameColorSlotChange}
                    />
                  ) : editModalTab === 'cerceveler' ? (
                    <section className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="m-0 text-xs text-muted-foreground">{txa('Avatar cercevesini sec; sagdaki onizleme aktif halini gosterir.')}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">{ownedFrames.length}{' '}{txa('cerceve')}</span>
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">{activeFrameTitle}</span>
                        </div>
                      </div>
                      {ownedFrames.length > 0 ? (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                          {ownedFrames.map((frameIdentifier) => {
                            const isEquipped = rawFrame === frameIdentifier
                            const info = ownedFrameInfos.find((frame) => frame.identifier === frameIdentifier)
                            return (
                              <ProfileEditFrameCard
                                key={frameIdentifier}
                                frameId={frameIdentifier}
                                avatarUrl={previewFansub.avatar}
                                item={info ? {
                                  identifier: info.identifier,
                                  name: info.name || frameIdentifier,
                                  customAssetUrl: info.customAssetUrl,
                                  posterAssetUrl: info.posterAssetUrl,
                                  type: 'frame',
                                } : undefined}
                                selected={isEquipped}
                                disabled={saving}
                                onSelect={() => setEquippedFrame(frameIdentifier)}
                              />
                            )
                          })}
                        </div>
                      ) : (
                        <StoreLinkState href="/magaza" onClose={onClose} text={txa('Magazadan cerceve satin alabilirsin.')} />
                      )}
                    </section>
                  ) : editModalTab === 'profilEfektleri' ? (
                    <section className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="m-0 text-xs text-muted-foreground">{txa('Bir efekt secerek sagdaki onizlemede fansub karti uzerindeki halini gor.')}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">{ownedProfileEffects.length}{' '}{txa('efekt')}</span>
                          {activeProfileEffect ? (
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">{activeProfileEffect.name}</span>
                          ) : null}
                        </div>
                      </div>
                      {ownedProfileEffects.length > 0 ? (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                          {ownedProfileEffects.map((effect) => {
                            const isEquipped = activeProfileEffectId === effect.id
                            return (
                              <ProfileEditProfileEffectCard
                                key={effect.id}
                                effect={effect}
                                selected={isEquipped}
                                disabled={saving}
                                onSelect={() => setEquippedProfileEffectId(effect.id)}
                              />
                            )
                          })}
                        </div>
                      ) : (
                        <StoreLinkState href="/magaza/katalog?tur=efekt" onClose={onClose} text={txa('Henuz fansub envanterinde profil efekti yok. Magazadan satin alip burada etkinlestirebilirsin.')} />
                      )}
                    </section>
                  ) : (
                    <section className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="m-0 text-xs text-muted-foreground">{txa('Vitrinde gosterilecek en fazla 3 rozeti sec.')}</p>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">{txa('{v1}/3 secili', { v1: selectedBadgeIds.length })}</span>
                      </div>
                      {ownedBadges.length > 0 ? (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                          {ownedBadges.map((badge, index) => {
                            const isSelected = selectedBadgeIds.includes(badge.badge_id)
                            const selectOrder = selectedBadgeIds.indexOf(badge.badge_id) + 1
                            const toggleBadge = () => {
                              if (isSelected) {
                                setSelectedBadgeIds((prev) => prev.filter((badgeId) => badgeId !== badge.badge_id))
                                return
                              }
                              if (selectedBadgeIds.length < 3) {
                                setSelectedBadgeIds((prev) => [...prev, badge.badge_id])
                              }
                            }
                            return (
                              <BadgePickerCard
                                key={`${badge.id}-${badge.badge_id}-${index}`}
                                imageUrl={badge.badge?.image_url || '/badges/default.png'}
                                name={badge.badge?.name || txa('Rozet')}
                                selected={isSelected}
                                selectOrder={selectOrder}
                                disabled={saving}
                                limitReached={selectedBadgeIds.length >= 3}
                                onToggle={toggleBadge}
                              />
                            )
                          })}
                        </div>
                      ) : (
                        <StoreLinkState href="/magaza" onClose={onClose} text={txa('Henuz hic rozetin yok.')} />
                      )}
                    </section>
                  )}
                </div>
              </div>
            </div>

            {/* SAG: Tek canli onizleme — hover karti (tema dahil tum kozmetik) */}
            <aside className="hidden min-h-0 flex-col items-center justify-center border-l border-border/40 bg-muted/10 px-4 py-4 lg:flex">
              <div className="relative" style={{ width: `${PREVIEW_WIDTH_PX}px` }}>
                <div className="overflow-hidden rounded-[18px] shadow-2xl" style={{ height: `${PREVIEW_HEIGHT_PX}px` }}>
                  <div
                    className="pointer-events-none select-none"
                    style={{
                      height: `${FANSUB_SHOWCASE_HEIGHT_PX}px`,
                      transform: `scale(${PREVIEW_SCALE})`,
                      transformOrigin: 'top left',
                      width: `${FANSUB_SHOWCASE_WIDTH_PX}px`,
                    }}
                  >
                    <FansubHoverCardSurface
                      className="w-full"
                      activeProfileEffectAssets={previewProfileEffectAssets ?? undefined}
                      themeColors={hasHoverThemeAccess ? editDraft.hoverTheme : null}
                      hasCustomBg={Boolean(hoverPreviewBackgroundStyle || hoverPreviewVideoUrl)}
                      profileBackgroundStyle={hoverPreviewBackgroundStyle}
                      profileBackgroundVideoUrl={hoverPreviewVideoUrl}
                      name={previewFansub.name}
                      slug={editDraft.slug || fansub.slug}
                      fansubHref="#"
                      avatar={previewFansub.avatar}
                      frameType={effectiveFrame}
                      frameCustomOverlayUrl={effectiveCustomFrameUrl}
                      framePosterOverlayUrl={effectivePosterFrameUrl}
                      hasGoldFrame={boostSnapshot?.capabilities?.hasGoldFrame === true}
                      hasDiscoverBadge={boostSnapshot?.capabilities?.hasDiscoverBadge === true}
                      nameClassName={hasNameTextAccess ? fansubHeaderNameClassName : undefined}
                      nameInlineStyle={hasNameTextAccess ? selectedNamePreviewInlineStyle : undefined}
                      description={editDraft.description}
                      mangaCount={fansub.mangaCount ?? 0}
                      followerCount={followersCount}
                      displayedBadges={hoverPreviewBadges}
                      participationStatus="active"
                      showActionMenu={false}
                      canFollowFansub={false}
                    />
                  </div>
                </div>
                <PreviewActionButton
                  className="left-[44px] top-[150px]"
                  icon={<Upload className="size-3.5" />}
                  label={txa('Avatar degistir')}
                  onClick={() => setActivePreviewTool('avatar')}
                />
                <PreviewActionButton
                  className="right-3 top-3"
                  icon={canUploadStaticBackground ? <ImagePlus className="size-3.5" /> : <Zap className="size-3.5" />}
                  label={canUploadStaticBackground ? txa('Arka plan degistir') : txa('Takviye ile ac')}
                  tone={canUploadStaticBackground ? 'default' : 'boost'}
                  onClick={() => setActivePreviewTool('background')}
                />
              </div>
              <p className="mt-3 text-center text-[10px] font-semibold text-muted-foreground/70">
                {txa('Fansub vitrini ve hover karti bu gorunumu paylasir.')}
              </p>
            </aside>
          </div>
        </div>

        {/* Yan panel: avatar ve arka plan yonetimi */}
        <Sheet
          open={activePreviewTool !== null}
          onOpenChange={(open) => {
            if (!open) setActivePreviewTool(null)
          }}
        >
          <SheetContent
            side="right"
            overlayClassName="z-[11040]"
            className="z-[11050] w-[min(460px,calc(100vw-1rem))] border-l border-border/70 bg-card/98 p-0 sm:max-w-[460px]"
          >
            <SheetHeader className="border-b border-border/70 px-5 py-4">
              <SheetTitle>{activePreviewTool === 'avatar' ? txa('Avatar') : txa('Fansub arka plani')}</SheetTitle>
              <SheetDescription>
                {activePreviewTool === 'avatar'
                  ? txa('Fansub avatarini dogrudan onizlemenin ustunden yonet.')
                  : txa('Tek aktif fansub arka plani burada secilir. Statik ve video arka planlar Seviye 1 takviye ile birlikte acilir.')}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-5">
                {activePreviewTool === 'avatar' ? (
                  <PreviewUploadPanel
                    accent
                    accept="image/*"
                    ctaLabel="Avatar sec"
                    description={txa('JPG, PNG, WEBP veya GIF yukle. Kaydet dediginde fansub avatarina uygulanir.')}
                    disabled={saving}
                    hasPendingSelection={hasPendingAvatarUpload}
                    maxSizeLabel={`Maksimum dosya boyutu: ${FANSUB_EDIT_AVATAR_MAX_SIZE_MB}MB`}
                    onFileChange={handleAvatarFile}
                    onReset={onAvatarSelectionReset}
                    resetLabel="Secimi temizle"
                    selectionLabel={avatarSelectionLabel || txa('Henuz yeni avatar secilmedi.')}
                    title={txa('Avatar yukleme')}
                  />
                ) : null}

                {activePreviewTool === 'background' ? (
                  <>
                    {canManageBackgroundSurface ? (
                      <>
                        <PreviewUploadPanel
                          accent
                          accept={backgroundAccept}
                          ctaLabel="Arka plan sec"
                          description={
                            canUploadStaticBackground && canUploadVideoBackground
                              ? txa('JPG, PNG, WEBP, WEBM veya MP4 yukle. Kaydet dediginde aktif fansub vitrini arka planina uygulanir.')
                              : canUploadVideoBackground
                                ? 'Bu yerlesimde yalnizca WEBM veya MP4 video arka plan kullanilabilir.'
                                : 'Bu yerlesimde yalnizca JPG, PNG veya WEBP statik arka plan kullanilabilir.'
                          }
                          disabled={saving}
                          hasPendingSelection={hasPendingBackgroundUpload}
                          maxSizeLabel={`Maksimum dosya boyutu: ${FANSUB_EDIT_BACKGROUND_MAX_SIZE_MB}MB`}
                          onFileChange={handleBackgroundFile}
                          onReset={onBackgroundSelectionReset}
                          resetLabel="Varsayilana don"
                          selectionLabel={backgroundSelectionLabel || txa('Henuz yeni arka plan secilmedi.')}
                          title={txa('Arka plan yukleme')}
                        />

                        {selectableBackgrounds.length > 0 ? (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{txa('Aktif sahneler')}</p>
                              <h4 className="text-sm font-semibold text-foreground">{txa('Tek aktif arka plan')}</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {selectableBackgrounds.map((background) => {
                                const isEquipped = effectiveBgId === background.id
                                const resolvedBackgroundUrl = resolveStoreAssetUrl(background.posterBackground || background.background) || background.posterBackground || background.background
                                const previewUrl = background.videoUrl && !failedVideoUrls.has(background.videoUrl)
                                  ? (resolveStoreAssetUrl(background.videoUrl) || background.videoUrl)
                                  : undefined
                                return (
                                  <button
                                    key={background.id}
                                    type="button"
                                    onClick={() => setEquippedBackground(background)}
                                    disabled={saving}
                                    className={cn(
                                      'group relative aspect-video overflow-hidden rounded-2xl border text-left transition duration-200 hover:-translate-y-0.5',
                                      isEquipped ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]' : 'border-border/70 hover:border-primary/45',
                                    )}
                                  >
                                    <div className="absolute inset-0" style={{ background: resolvedBackgroundUrl }}>
                                      {previewUrl ? (
                                        <video className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" src={previewUrl} autoPlay loop muted playsInline onError={() => markVideoAsFailed(previewUrl)} />
                                      ) : /^(https?:|data:|blob:|\/)/i.test(resolvedBackgroundUrl) ? (
                                        <img loading="lazy" decoding="async" src={resolvedBackgroundUrl} alt={background.label} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                      ) : (
                                        <div className="h-full w-full" style={{ background: resolvedBackgroundUrl }} />
                                      )}
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" aria-hidden />
                                    {isEquipped ? (
                                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary-foreground">{txa('Aktif')}</span>
                                    ) : null}
                                    <span className="absolute inset-x-2.5 bottom-2">
                                      <span className="block truncate text-xs font-black text-white drop-shadow">{background.label}</span>
                                      <span className="block text-[10px] font-bold text-white/60">{background.origin === 'upload' ? txa('Yukleme') : txa('Kayitli secenek')}</span>
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : (
                          <StoreLinkState href="/magaza" onClose={onClose} text="Bu yerlesimde kullanilabilir arka planin yok. Desteklenen medya tipine uygun bir secim yapabilir veya magazadan yeni bir arka plan alabilirsin." />
                        )}
                      </>
                    ) : (
                      <div className="rounded-[24px] border border-primary/20 bg-primary/5 p-5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs text-primary">
                          <Zap className="size-3.5" />
                          {txa('Takviye ile acilir')}
                        </div>
                        <h4 className="mt-4 text-base font-semibold text-foreground">{txa('Fansub vitrini arka plani kilitli')}</h4>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {isBoostEnabled
                            ? txa('Arka plan yuzeyi su an policy tarafinda kapali. Capability yeniden acilana kadar yeni secim kullanilamaz; varsa eski medya varsayilana duser.')
                            : txa('Takviye sistemi kapali oldugu icin arka plan capability\'si de pasif durumda.')}
                        </p>
                        {onOpenBoost ? (
                          <Button type="button" className="mt-4" onClick={onOpenBoost}>
                            <Zap className="size-4" />
                            {txa('Takviyeye git')}
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </DialogContent>
    </Dialog>
  )
}
