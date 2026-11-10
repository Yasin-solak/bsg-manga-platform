import { type FrameType } from '@components/common/AvatarFrame'
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
import type { ProfileTheme } from '@/lib/profileTheme'
import { ProfileThemePicker } from './ProfileThemePicker'
import { UserNameStyleStudio } from './UserNameStyleStudio'
import { usePremiumPerks } from '@/lib/premiumPerks'
import { Link } from '@/i18n/router'
import { cn } from '@/lib/utils'
import { isVideoAssetUrl, resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { PrivacyVisibility, UserPrivacySettings } from '@/services/userService'
import type { MySelectableFansubIdentityTag } from '@/services/fansubIdentityTagService'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_MOTION_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
  type NameTextMotionId,
} from '@/data/nameTextEffects'
import {
  DEFAULT_NAME_TEXT_FX_SELECTION,
  type NameTextFxSelection,
} from '@/data/userNameStyle'
import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
import { BadgeCheck, ImagePlus, LayoutTemplate, Palette, PenLine, Shield, ShieldCheck, Sparkles, Type, Upload, X } from 'lucide-react'
import { useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
import { KNOWN_PROFILE_FRAME_TYPES } from './helpers'
import { buildProfileEditPreviewUser, buildPreviewDisplayedBadges, PROFILE_EDIT_AVATAR_MAX_SIZE_MB, PROFILE_EDIT_BACKGROUND_ACCEPT, PROFILE_EDIT_BACKGROUND_MAX_SIZE_MB } from './profileEditForm'
import ProfileEditFansubIdentitySection from './ProfileEditFansubIdentitySection'
import ProfileEditBasicsSection from './ProfileEditBasicsSection'
import ProfileEditBadgesSection from './ProfileEditBadgesSection'
import ProfileEditFramesSection from './ProfileEditFramesSection'
import ProfileEditLivePreview from './ProfileEditLivePreview'
import ProfileEditProfileEffectsSection from './ProfileEditProfileEffectsSection'
import { PrivacySettingsSection } from './ProfileEditPrivacyControls'
import type { EditModalTab, MockUser, OwnedBackground, ProfileEditDraft, ProfileOwnedBadge, ProfileOwnedEffect } from './types'
import { txa } from '@/i18n/activeLocale'
type NavSection = { description: string; icon: ReactNode; id: EditModalTab; title: string }
const NAV_GROUPS: Array<{ label: string; sections: NavSection[] }> = [
  {
    get label() { return txa('Kimlik') },
    sections: [
      { id: 'profil', get title() { return txa('Profil') }, get description() { return txa('Biyografi ve bağlantılar') }, icon: <PenLine className="size-4" /> },
      { id: 'gizlilik', get title() { return txa('Gizlilik') }, get description() { return txa('Hesap gizliliği ve profil görünürlüğü') }, icon: <Shield className="size-4" /> },
    ],
  },
  {
    get label() { return txa('Görünüm') },
    sections: [
      { id: 'hoverTemasi', get title() { return txa('Profil Teması') }, get description() { return txa('Sahne, kartlar ve renkler') }, icon: <Palette className="size-4" /> },
      { id: 'metinAnimasyonlari', get title() { return txa('İsim Stili') }, get description() { return txa('Font, efekt ve renkler') }, icon: <Type className="size-4" /> },
      { id: 'cerceveler', get title() { return txa('Çerçeveler') }, get description() { return txa('Avatar çerçevesi') }, icon: <LayoutTemplate className="size-4" /> },
      { id: 'profilEfektleri', get title() { return txa('Profil Efektleri') }, get description() { return txa('Overlay efektleri') }, icon: <Sparkles className="size-4" /> },
    ],
  },
  {
    get label() { return txa('Topluluk') },
    sections: [
      { id: 'fansubEtiketleri', get title() { return txa('Fansub Etiketleri') }, get description() { return txa('Destekçi ve üye etiketi') }, icon: <ShieldCheck className="size-4" /> },
      { id: 'rozetler', get title() { return txa('Rozetler') }, get description() { return txa('Vitrin rozet sırası') }, icon: <BadgeCheck className="size-4" /> },
    ],
  },
]
const ALL_SECTIONS = NAV_GROUPS.flatMap((group) => group.sections)
type PreviewTool = 'avatar' | 'background'
type ProfileEditDialogProps = {
  avatarSelectionLabel: string | null
  backgroundSelectionLabel: string | null
  editDraft: ProfileEditDraft
  editModalTab: EditModalTab
  equippedBackground: OwnedBackground | null
  equippedFrame: string | null
  effectivePosterFrameUrl?: string
  equippedProfileEffect: ProfileOwnedEffect | null
  hasPendingAvatarUpload: boolean
  hasPendingBackgroundUpload: boolean
  hasNameTextAccess: boolean
  onAvatarFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onAvatarSelectionReset: () => void
  onBackgroundFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBackgroundReset: () => void
  onBackgroundSelectionReset: () => void
  onClose: () => void
  onDraftChange: (patch: Partial<ProfileEditDraft>) => void
  onEquippedBackgroundChange: (background: OwnedBackground) => void
  onEquippedFrameChange: (frameId: string) => void
  onEquippedProfileEffectChange: (effect: ProfileOwnedEffect | null) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
  onSelectedBadgeIdsChange: (badgeIds: string[]) => void
  onSelectedNameColorChange: (colorId: NameTextColorId) => void
  onSelectedNameColorSlotChange: (slot: 'primary' | 'secondary') => void
  onSelectedNameEffectChange: (effectId: NameTextEffectId) => void
  onSelectedNameFontChange: (fontId: NameTextFontId) => void
  onSelectedNameSecondaryColorChange: (colorId: NameTextColorId) => void
  onSelectedNameMotionChange: (motionId: NameTextMotionId) => void
  onSelectedNameFxChange: (fx: NameTextFxSelection) => void
  onTabChange: (tab: EditModalTab) => void
  open: boolean
  ownedBadges: ProfileOwnedBadge[]
  ownedProfileEffects: ProfileOwnedEffect[]
  onProfileVisibilityChange: (value: PrivacyVisibility) => void
  onPrivacySettingChange: (key: keyof UserPrivacySettings, value: PrivacyVisibility) => void
  profileVisibility: PrivacyVisibility
  privacySettings: UserPrivacySettings | null
  resolvedFrames: ResolvedInventoryItem[]
  saving: boolean
  selectableFansubIdentityTags: MySelectableFansubIdentityTag[]
  selectedBadgeIds: string[]
  selectedFansubIdentityTagId: string | null
  selectedNameColorId: NameTextColorId
  selectedNameColorSlot: 'primary' | 'secondary'
  selectedNameEffectId: NameTextEffectId
  selectedNameFontId: NameTextFontId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameMotionId: NameTextMotionId
  selectedNameFx: NameTextFxSelection
  selectedNameStyleClassName: string
  selectedNameStyleInlineStyle?: CSSProperties
  selectedHoverTheme: ProfileTheme | null
  onSelectedHoverThemeChange: (value: ProfileTheme | null) => void
  isFansubIdentityTagsLoading?: boolean
  onSelectedFansubIdentityTagChange: (tagId: string | null) => void
  user: MockUser
}

function PreviewActionButton({
  className,
  icon,
  label,
  onClick,
}: {
  className?: string
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'pointer-events-auto absolute z-20 inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white shadow-lg backdrop-blur-md transition-colors hover:border-primary/50 hover:bg-black/70',
        className,
      )}
    >
      {icon}
    </button>
  )
}

function SectionHeader({ section }: { section: NavSection }) {
  return (
    <header className="mb-4">
      <h2 className="m-0 text-base font-black text-foreground">{section.title}</h2>
      <p className="m-0 mt-1 text-xs text-muted-foreground">{section.description}</p>
      <div className="mt-3 h-px bg-border/40" />
    </header>
  )
}

export default function ProfileEditDialog({
  avatarSelectionLabel,
  backgroundSelectionLabel,
  editDraft,
  editModalTab,
  equippedBackground,
  equippedFrame,
  effectivePosterFrameUrl,
  equippedProfileEffect,
  hasPendingAvatarUpload,
  hasPendingBackgroundUpload,
  hasNameTextAccess,
  onAvatarFileChange,
  onAvatarSelectionReset,
  onBackgroundFileChange,
  onBackgroundReset,
  onBackgroundSelectionReset,
  onClose,
  onDraftChange,
  onEquippedBackgroundChange,
  onEquippedFrameChange,
  onEquippedProfileEffectChange,
  onOpenChange,
  onSave,
  onSelectedBadgeIdsChange,
  onSelectedNameColorChange,
  onSelectedNameColorSlotChange,
  onSelectedNameEffectChange,
  onSelectedNameFontChange,
  onSelectedNameSecondaryColorChange,
  onSelectedNameMotionChange,
  onSelectedNameFxChange,
  onTabChange,
  open,
  ownedBadges,
  ownedProfileEffects,
  onProfileVisibilityChange,
  onPrivacySettingChange,
  profileVisibility,
  privacySettings,
  resolvedFrames,
  saving,
  selectableFansubIdentityTags,
  selectedBadgeIds,
  selectedFansubIdentityTagId,
  selectedNameColorId,
  selectedNameColorSlot,
  selectedNameEffectId,
  selectedNameFontId,
  selectedNameSecondaryColorId,
  selectedNameMotionId,
  selectedNameFx,
  selectedNameStyleClassName,
  selectedNameStyleInlineStyle,
  selectedHoverTheme,
  onSelectedHoverThemeChange,
  isFansubIdentityTagsLoading = false,
  onSelectedFansubIdentityTagChange,
  user,
}: ProfileEditDialogProps) {
  const [activePreviewTool, setActivePreviewTool] = useState<PreviewTool | null>(null)

  const handleTabChange = (tab: EditModalTab) => {
    onTabChange(tab)
  }

  const rawFrame = equippedFrame ?? user.frameType ?? 'default'
  const effectiveFrame: FrameType = KNOWN_PROFILE_FRAME_TYPES.includes(rawFrame as (typeof KNOWN_PROFILE_FRAME_TYPES)[number]) ? (rawFrame as FrameType) : 'default'
  const resolvedFrameItem = resolvedFrames.find((frame) => frame.identifier === rawFrame)
  const rawCustomFrameUrl = resolvedFrameItem?.customAssetUrl
  const resolvedPosterFrameUrl = effectivePosterFrameUrl || resolvedFrameItem?.posterAssetUrl
  const effectiveCustomFrameUrl = KNOWN_PROFILE_FRAME_TYPES.includes(rawFrame as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])
    ? undefined
    : (resolveStoreAssetUrl(rawCustomFrameUrl) || rawCustomFrameUrl)
  const localEffectivePosterFrameUrl = KNOWN_PROFILE_FRAME_TYPES.includes(rawFrame as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])
    ? undefined
    : (resolveStoreAssetUrl(resolvedPosterFrameUrl) || resolvedPosterFrameUrl)
  const previewUser = buildProfileEditPreviewUser(
    user,
    editDraft,
    selectableFansubIdentityTags.find((item) => item.id === selectedFansubIdentityTagId) ?? null,
  )
  const selectedBadgeIdsForDisplay = Array.from(new Set(selectedBadgeIds)).slice(0, 3)
  const previewOwnedBadges = buildPreviewDisplayedBadges(ownedBadges, selectedBadgeIdsForDisplay)
  // Shop Control > Premium: a disabled perk shows as locked here too (the server does not apply it anyway).
  const premiumPerks = usePremiumPerks()
  const hoverThemeAccess = hasNameTextAccess && premiumPerks.isEnabled('hover_theme')
  const nameStyleAccess = hasNameTextAccess && premiumPerks.isEnabled('name_style')
  const backgroundUploadEnabled = premiumPerks.isEnabled('custom_background')
  const displayedBackgrounds = equippedBackground && !user.ownedBackgrounds.some((background) => background.id === equippedBackground.id)
    ? [equippedBackground, ...user.ownedBackgrounds]
    : user.ownedBackgrounds
  const activeSection = ALL_SECTIONS.find((section) => section.id === editModalTab) ?? ALL_SECTIONS[0]

  const previewThemeColors = hasNameTextAccess ? selectedHoverTheme : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                <DialogTitle className="truncate text-[15px] font-black tracking-tight">{txa('Görünüm Stüdyosu')}</DialogTitle>
                <DialogDescription className="hidden truncate text-xs text-muted-foreground/80 sm:block">
                  {txa('Profil vitrini ve görsel kimliğini tek akışta düzenle.')}
                </DialogDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-[11px] text-muted-foreground/60 md:block">{txa('Değişiklikler kaydet\'e basılınca uygulanır')}</span>
              <Button variant="ghost" onClick={onClose} disabled={saving} className="rounded-full px-4">{txa('İptal')}</Button>
              <Button onClick={onSave} disabled={saving} className="rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">
                {saving ? txa('Kaydediliyor...') : txa('Kaydet')}
              </Button>
            </div>
          </div>

          {/* Govde: sol nav + orta icerik + sag onizleme */}
          <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[224px_minmax(0,1fr)_minmax(0,396px)]">
            {/* SOL: Gruplu navigasyon */}
            <nav className="hidden min-h-0 flex-col overflow-y-auto border-r border-border/40 px-3 py-4 lg:flex" aria-label={txa('Düzenleme bölümleri')}>
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="mb-1.5 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.sections.map((section) => {
                      const isActive = editModalTab === section.id
                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => handleTabChange(section.id)}
                          disabled={saving}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
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
                      onClick={() => handleTabChange(section.id)}
                      disabled={saving}
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors',
                        editModalTab === section.id
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground',
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
                    <ProfileEditBasicsSection
                      draft={editDraft}
                      onAvatarEdit={() => setActivePreviewTool('avatar')}
                      onDraftChange={onDraftChange}
                      previewUser={previewUser}
                      saving={saving}
                      user={user}
                    />
                  ) : editModalTab === 'gizlilik' ? (
                    <div className="space-y-8">
                      <section className="space-y-3">
                        <div>
                          <h3 className="m-0 text-sm font-black text-foreground">{txa('Profil görünürlüğü')}</h3>
                          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{txa('Hesabını gizli yap ya da profil yüzeylerini kimlerin görebileceğini seç.')}</p>
                        </div>
                        <PrivacySettingsSection
                          disabled={saving}
                          profileVisibility={profileVisibility}
                          onProfileVisibilityChange={onProfileVisibilityChange}
                          settings={privacySettings}
                          onSettingChange={onPrivacySettingChange}
                        />
                      </section>

                      {/* Hesap guvenligi (oturumlar, sifre, iki adimli dogrulama), bildirimler ve engellenenler
                          profile degil hesaba ait: Ayarlar'da yonetilir, burada yalniz kisayol. */}
                      <section className="space-y-3 border-t border-border/40 pt-6" data-testid="profile-privacy-settings-links">
                        <div>
                          <h3 className="m-0 text-sm font-black text-foreground">{txa('Hesap ayarları')}</h3>
                          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{txa('Güvenlik, bildirimler ve engellenenler artık Ayarlar sayfasında.')}</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {[
                            { to: '/ayarlar?bolum=guvenlik', title: txa('Güvenlik'), hint: txa('Oturumlar, şifre, iki adımlı doğrulama') },
                            { to: '/ayarlar?bolum=bildirim', title: txa('Bildirimler'), hint: txa('Neyden haberdar olacağın') },
                            { to: '/ayarlar?bolum=gizlilik', title: txa('Engellenenler'), hint: txa('Engellediğin hesaplar') },
                          ].map((item) => (
                            <Link
                              key={item.to}
                              to={item.to}
                              onClick={onClose}
                              className="rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 transition-colors hover:border-primary/45"
                            >
                              <span className="block text-sm font-black text-foreground">{item.title}</span>
                              <span className="block text-[11px] text-muted-foreground">{item.hint}</span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    </div>
                  ) : editModalTab === 'hoverTemasi' ? (
                    <ProfileThemePicker
                      value={hoverThemeAccess ? selectedHoverTheme : null}
                      onChange={onSelectedHoverThemeChange}
                      disabled={saving}
                      hasAccess={hoverThemeAccess}
                      previewName={previewUser.displayName || user.username}
                      lockedSlot={!premiumPerks.isEnabled('hover_theme') ? (
                        <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                          {txa('Profil teması şu anda kapalı. Tüm kartlar varsayılan temada görünür.')}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                          {txa('Profil teması')} <strong className="text-foreground">{txa('Premium')}</strong> {txa('ile açılır. Profil sayfanın zemini, yan kartların, düğmelerin ve hover kartın seçtiğin temayla renklenir.')}{' '}
                          <Link to="/magaza/premium" onClick={onClose} className="font-semibold text-primary hover:underline">
                            {txa('Premium\'a goz at')}
                          </Link>
                        </div>
                      )}
                    />
                  ) : editModalTab === 'metinAnimasyonlari' ? (
                    <UserNameStyleStudio
                      disabled={saving}
                      hasAccess={nameStyleAccess}
                      lockedState={!premiumPerks.isEnabled('name_style') ? (
                        <div className="rounded-2xl border border-border/70 bg-card/95 p-5 text-center text-sm text-muted-foreground">
                          <h3 className="mb-1 text-base font-black text-foreground">{txa('İsim stili şu anda kapalı')}</h3>
                          {txa('Kayıtlı seçimin silinmedi; özellik yeniden açıldığında adın yine böyle görünür.')}
                        </div>
                      ) : undefined}
                      onPremiumNavigate={onClose}
                      previewText={previewUser.displayName || user.username}
                      theme={hoverThemeAccess ? selectedHoverTheme : null}
                      value={{
                        fontId: selectedNameFontId,
                        effectId: selectedNameEffectId,
                        colorId: selectedNameColorId,
                        secondaryColorId: selectedNameSecondaryColorId,
                        motionId: selectedNameMotionId,
                        ...selectedNameFx,
                      }}
                      onChange={(patch) => {
                        if (patch.fontId) onSelectedNameFontChange(patch.fontId)
                        if (patch.effectId) onSelectedNameEffectChange(patch.effectId)
                        if (patch.colorId) onSelectedNameColorChange(patch.colorId)
                        if (patch.secondaryColorId) onSelectedNameSecondaryColorChange(patch.secondaryColorId)
                        if (patch.motionId) onSelectedNameMotionChange(patch.motionId)
                        if (patch.fillId || patch.fxTint || patch.fxColors) {
                          onSelectedNameFxChange({
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
                        onSelectedNameMotionChange(DEFAULT_NAME_TEXT_MOTION_ID)
                        onSelectedNameFxChange(DEFAULT_NAME_TEXT_FX_SELECTION)
                        onSelectedNameColorSlotChange('primary')
                      }}
                      colorSlot={selectedNameColorSlot}
                      onColorSlotChange={onSelectedNameColorSlotChange}
                    />
                  ) : editModalTab === 'cerceveler' ? (
                    <ProfileEditFramesSection
                      avatarUrl={previewUser.avatar}
                      disabled={saving}
                      equippedFrameId={rawFrame}
                      onClose={onClose}
                      onEquippedFrameChange={onEquippedFrameChange}
                      ownedFrameIds={user.ownedFrames}
                      resolvedFrames={resolvedFrames}
                    />
                  ) : editModalTab === 'profilEfektleri' ? (
                    <ProfileEditProfileEffectsSection
                      disabled={saving}
                      equippedProfileEffect={equippedProfileEffect}
                      onClose={onClose}
                      onEquippedProfileEffectChange={onEquippedProfileEffectChange}
                      ownedProfileEffects={ownedProfileEffects}
                    />
                  ) : editModalTab === 'fansubEtiketleri' ? (
                    <ProfileEditFansubIdentitySection
                      followedFansubs={user.followingFansubs}
                      items={selectableFansubIdentityTags}
                      profileUserId={user.id}
                      selectedTagId={selectedFansubIdentityTagId}
                      disabled={saving}
                      isLoading={isFansubIdentityTagsLoading}
                      onClose={onClose}
                      onSelectedTagIdChange={onSelectedFansubIdentityTagChange}
                    />
                  ) : (
                    <ProfileEditBadgesSection
                      disabled={saving}
                      onClose={onClose}
                      onSelectedBadgeIdsChange={onSelectedBadgeIdsChange}
                      ownedBadges={ownedBadges}
                      selectedBadgeIds={selectedBadgeIdsForDisplay}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* SAG: Tek canli onizleme — tema dahil tum taslak durum yansir */}
            <ProfileEditLivePreview
              activeProfileEffectAssets={equippedProfileEffect?.profileEffectAssets}
              effectiveBg={equippedBackground}
              effectiveCustomFrameUrl={effectiveCustomFrameUrl}
              effectivePosterFrameUrl={localEffectivePosterFrameUrl}
              effectiveFrame={effectiveFrame}
              ownedBadges={previewOwnedBadges}
              profileHeaderNameClassName={selectedNameStyleClassName}
              profileHeaderNameInlineStyle={selectedNameStyleInlineStyle}
              themeColors={previewThemeColors}
              user={previewUser}
              actionSlot={(
                <>
                  <PreviewActionButton
                    className="left-[72px] top-[178px]"
                    icon={<Upload className="size-3.5" />}
                    label={txa('Avatar değiştir')}
                    onClick={() => setActivePreviewTool('avatar')}
                  />
                  <PreviewActionButton
                    className="right-3 top-3"
                    icon={<ImagePlus className="size-3.5" />}
                    label={txa('Arka plan değiştir')}
                    onClick={() => setActivePreviewTool('background')}
                  />
                </>
              )}
            />
          </div>
        </div>

        {/* Yan panel: avatar ve arka plan yonetimi */}
        <Sheet
          open={activePreviewTool !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setActivePreviewTool(null)
          }}
        >
          <SheetContent
            side="right"
            overlayClassName="z-[11040]"
            className="z-[11050] w-[min(460px,calc(100vw-1rem))] border-l border-border/70 bg-card/98 p-0 sm:max-w-[460px]"
          >
            <SheetHeader className="border-b border-border/70 px-5 py-4">
              <SheetTitle>{activePreviewTool === 'avatar' ? txa('Avatar') : txa('Profil arka planı')}</SheetTitle>
              <SheetDescription>
                {activePreviewTool === 'avatar'
                  ? txa('Avatarını doğrudan önizlemenin üstünden yönet.')
                  : txa('Profil sahnesinin arka planını seç veya kendi medyanı yükle.')}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-5">
                {activePreviewTool === 'avatar' ? (
                  <div className="rounded-[20px] border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center gap-4">
                      <div className="size-20 shrink-0 overflow-hidden rounded-full border-2 border-border bg-card shadow-lg">
                        <img loading="lazy" decoding="async" src={previewUser.avatar} alt={txa('Avatar önizleme')} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 space-y-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary">
                          <input type="file" accept="image/*" onChange={onAvatarFileChange} className="pointer-events-none absolute h-0 w-0 opacity-0" disabled={saving} />
                          <ImagePlus className="size-4" />
                          {txa('Masaustunden sec')}
                        </label>
                        {hasPendingAvatarUpload ? (
                          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onAvatarSelectionReset} disabled={saving}>
                            {txa('Secimi temizle')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p className="m-0">{avatarSelectionLabel || txa('JPG, PNG, WEBP veya GIF sec. Kaydet dediginde storagea yuklenir.')}</p>
                      <p className="m-0">{txa('Maksimum dosya boyutu:')}{' '}{PROFILE_EDIT_AVATAR_MAX_SIZE_MB}MB</p>
                    </div>
                  </div>
                ) : null}

                {activePreviewTool === 'background' ? (
                  <>
                    {!backgroundUploadEnabled ? (
                      <p className="m-0 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                        {txa('Kişisel arka plan yükleme şu anda kapalı. Yüklediğin arka planlar silinmedi.')}
                      </p>
                    ) : null}
                    <label
                      className={cn(
                        'group relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-7 text-center transition-colors',
                        hasPendingBackgroundUpload
                          ? 'border-primary/60 bg-primary/10'
                          : 'border-border/70 bg-background/40 hover:border-primary/45 hover:bg-primary/5',
                        saving && 'pointer-events-none opacity-60',
                        !backgroundUploadEnabled && 'hidden',
                      )}
                    >
                      <input
                        type="file"
                        accept={PROFILE_EDIT_BACKGROUND_ACCEPT}
                        onChange={onBackgroundFileChange}
                        className="pointer-events-none absolute h-0 w-0 opacity-0"
                        disabled={saving}
                      />
                      <span className={cn(
                        'flex size-11 items-center justify-center rounded-full border transition-colors',
                        hasPendingBackgroundUpload
                          ? 'border-primary/50 bg-primary/15 text-primary'
                          : 'border-border/70 bg-background/70 text-muted-foreground group-hover:border-primary/40 group-hover:text-primary',
                      )}>
                        <ImagePlus className="size-5" />
                      </span>
                      <span className="text-sm font-black text-foreground">
                        {hasPendingBackgroundUpload ? txa('Yeni arka plan secildi') : txa('Kisisel arka plan yukle')}
                      </span>
                      <span className="max-w-md text-xs leading-relaxed text-muted-foreground">
                        {backgroundSelectionLabel || txa('JPG, PNG, WEBP, WEBM veya MP4 sec. Kaydet dediginde profil sahnesine uygulanir.')}
                      </span>
                      <span className="flex flex-wrap items-center justify-center gap-1.5">
                        {['JPG', 'PNG', 'WEBP', 'WEBM', 'MP4'].map((format) => (
                          <span key={format} className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                            {format}
                          </span>
                        ))}
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">
                          {txa('Maks')}{' '}{PROFILE_EDIT_BACKGROUND_MAX_SIZE_MB}MB
                        </span>
                      </span>
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="m-0 text-[11px] text-muted-foreground">
                        {txa('Kisisel arka planlar tek slotta tutulur; yeni yukleme uzerine yazar.')}
                      </p>
                      <div className="flex items-center gap-2">
                        {hasPendingBackgroundUpload ? (
                          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onBackgroundSelectionReset} disabled={saving}>
                            {txa('Yuklemeyi temizle')}
                          </Button>
                        ) : null}
                        {equippedBackground ? (
                          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onBackgroundReset} disabled={saving}>
                            {txa('Varsayilana don')}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={onBackgroundReset}
                        disabled={saving}
                        aria-pressed={!equippedBackground}
                        className={cn(
                          'group relative aspect-video overflow-hidden rounded-2xl border text-left transition duration-200 hover:-translate-y-0.5',
                          !equippedBackground
                            ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_16px_40px_rgba(239,68,68,0.12)]'
                            : 'border-border/70 hover:border-primary/45',
                        )}
                      >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.22),transparent_48%),linear-gradient(140deg,#111827,#1f2937_50%,#0f172a)]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" aria-hidden />
                        {!equippedBackground ? (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary-foreground">
                            {txa('Aktif')}
                          </span>
                        ) : null}
                        <span className="absolute inset-x-2.5 bottom-2">
                          <span className="block truncate text-xs font-black text-white drop-shadow">{txa('Varsayilan sahne')}</span>
                          <span className="block text-[10px] font-bold text-white/60">{txa('Tema zemini')}</span>
                        </span>
                      </button>
                      {displayedBackgrounds.map((background, index) => {
                        const isEquipped = equippedBackground?.id === background.id
                        const backgroundUrl = resolveStoreAssetUrl(background.background) || background.background || ''
                        const isVideo = background.mediaType === 'video' || isVideoAssetUrl(backgroundUrl)
                        return (
                          <button
                            key={`${background.id}-${index}`}
                            type="button"
                            onClick={() => onEquippedBackgroundChange(background)}
                            disabled={saving}
                            aria-pressed={isEquipped}
                            className={cn(
                              'group relative aspect-video overflow-hidden rounded-2xl border text-left transition duration-200 hover:-translate-y-0.5',
                              isEquipped
                                ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_16px_40px_rgba(239,68,68,0.12)]'
                                : 'border-border/70 hover:border-primary/45',
                            )}
                          >
                            <div className="absolute inset-0">
                              {isVideo ? (
                                <video src={backgroundUrl} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" autoPlay loop muted playsInline />
                              ) : /^(https?:|data:|blob:|\/)/i.test(backgroundUrl) ? (
                                <img loading="lazy" decoding="async" src={backgroundUrl} alt={background.label} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                              ) : (
                                <div className="h-full w-full" style={{ background: backgroundUrl }} />
                              )}
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" aria-hidden />
                            {isEquipped ? (
                              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary-foreground">
                                {txa('Aktif')}
                              </span>
                            ) : null}
                            {isVideo ? (
                              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-white/90 backdrop-blur">
                                Video
                              </span>
                            ) : null}
                            <span className="absolute inset-x-2.5 bottom-2">
                              <span className="block truncate text-xs font-black text-white drop-shadow">{background.label}</span>
                              <span className="block text-[10px] font-bold text-white/60">
                                {background.origin === 'upload'
                                  ? `Kisisel slot ${typeof background.slotIndex === 'number' ? background.slotIndex + 1 : 1}`
                                  : txa('Kayıtlı seçenek')}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
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
