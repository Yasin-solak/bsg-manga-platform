import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const dialogSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditDialog.tsx'), 'utf8')
const basicsSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditBasicsSection.tsx'), 'utf8')
const privacyControlsSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditPrivacyControls.tsx'), 'utf8')
const previewSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditLivePreview.tsx'), 'utf8')
const mutationSource = fs.readFileSync(path.join(root, 'src/pages/profile/useProfileEditMutations.ts'), 'utf8')
const selectSource = fs.readFileSync(path.join(root, 'src/components/ui/select.tsx'), 'utf8')
const nameStyleSource = fs.readFileSync(path.join(root, 'src/components/common/NameStylePickerPanel.tsx'), 'utf8')
const fansubBoostServiceSource = fs.readFileSync(path.join(root, 'src/services/fansubBoostService.ts'), 'utf8')
const frameCardSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditFrameCard.tsx'), 'utf8')
const framesSectionSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditFramesSection.tsx'), 'utf8')
const fansubIdentitySectionSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditFansubIdentitySection.tsx'), 'utf8')
const badgeCardSource = fs.readFileSync(path.join(root, 'src/components/common/cosmeticPickerCards.tsx'), 'utf8')
const badgesSectionSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditBadgesSection.tsx'), 'utf8')
const profileEffectCardSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditProfileEffectCard.tsx'), 'utf8')
const profileEffectSectionSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileEditProfileEffectsSection.tsx'), 'utf8')
const accountTopBarSource = fs.readFileSync(path.join(root, 'src/components/layout/AccountTopBarActions.tsx'), 'utf8')
const appSidebarUtilsSource = fs.readFileSync(path.join(root, 'src/components/layout/appSidebar/appSidebarUtils.ts'), 'utf8')
const profileE2eSource = fs.readFileSync(path.join(root, 'src/pages/profile/profileE2eSnapshot.ts'), 'utf8')

assert.match(
  dialogSource,
  /import ProfileEditLivePreview from '\.\/ProfileEditLivePreview'/,
  'profile edit modal should delegate the right preview rail to ProfileEditLivePreview',
)

assert.doesNotMatch(
  dialogSource,
  /<ProfileIdentityShowcase[\s\S]+variant="editor"/,
  'profile edit modal should not inline the profile preview surface',
)

assert.match(
  dialogSource,
  /h-screen max-h-screen/,
  'profile edit modal should keep a stable full-height surface so tabs do not resize the dialog',
)

assert.match(
  dialogSource,
  /editModalTab === 'gizlilik'[\s\S]+<PrivacySettingsSection[\s\S]+data-testid="profile-privacy-settings-links"/,
  'privacy visibility lives in the gizlilik tab; account security is linked to Ayarlar instead of duplicated',
)
assert.doesNotMatch(dialogSource, /ProfileEditSecuritySection/, 'account security (sessions, MFA, notifications, blocked) is managed in Ayarlar, not the profile editor')
for (const section of ['guvenlik', 'bildirim', 'gizlilik']) {
  assert.ok(dialogSource.includes(`/ayarlar?bolum=${section}`), `profile privacy tab links to Ayarlar ${section}`)
}
// Settings: account privacy has two options, a follow requests shortcut on a private account.
const settingsAccountSource = fs.readFileSync(new URL('../../src/pages/settings/SettingsAccountSection.tsx', import.meta.url), 'utf8')
assert.match(settingsAccountSource, /<option value="public">\{txa\('Herkese açık'\)\}<\/option>\s*<option value="private">\{txa\('Gizli hesap'\)\}<\/option>/, 'settings account privacy has two options')
assert.match(settingsAccountSource, /\?takip-istekleri=1/, 'settings links to follow requests for private accounts')
// Scroll-free layout: Profile Theme and Name Style show setting groups one at a time in tabs.
for (const file of ['src/pages/profile/ProfileThemePicker.tsx', 'src/pages/profile/UserNameStyleStudio.tsx']) {
  assert.match(fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), /<StudioTabs/, `${file} uses studio tabs (no long scroll)`)
}

assert.match(
  privacyControlsSource,
  /function HeaderActionFrame/,
  'profile visibility and privacy settings should share the same header action frame language',
)

assert.match(
  dialogSource,
  /const activeSection = ALL_SECTIONS\.find[\s\S]+<SectionHeader section=\{activeSection\} \/>/,
  'the active section title should render once through a single SectionHeader rather than being duplicated per tab',
)

assert.match(
  basicsSource,
  /DiscordLogo[\s\S]+InstagramLogo[\s\S]+XLogo/,
  'profile social link editor should use actual platform icons instead of text marks',
)

assert.doesNotMatch(
  basicsSource,
  /mark:\s*'DC'|prefix:\s*'discord'|prefix:\s*'instagram'|prefix:\s*'x\.com'|\{field\.prefix\}|\{field\.mark\}/,
  'profile social link editor should not duplicate platform text through marks or prefixes',
)

assert.match(
  basicsSource,
  /Dış bağlantılar[\s\S]+SOCIAL_FIELDS\.map/,
  'profile social links should render as a compact icon-prefixed list, not a large grid of cards',
)

assert.match(
  privacyControlsSource,
  /PopoverTrigger asChild[\s\S]+type="button"[\s\S]+Gizlilik ayarları[\s\S]+USER_PRIVACY_SURFACES\.map/,
  'privacy settings should open a real popover with editable privacy surface controls',
)

assert.match(
  dialogSource,
  /editModalTab === 'profil' \? \(\s*<ProfileEditBasicsSection/,
  'profile tab content should use a clean stacked layout inside the shared content rail',
)

assert.match(
  basicsSource,
  /rows=\{3\}[\s\S]+className="min-h-\[78px\]"/,
  'profile bio editor should stay compact enough for the profile tab to fit without a visible scroll track',
)

assert.doesNotMatch(
  previewSource,
  /Hizli ayarlar|Hızlı ayarlar|Tema|Vurgu rengi/,
  'live preview rail should not contain quick settings controls',
)

assert.match(
  previewSource,
  /<ProfileIdentityShowcase[\s\S]+variant="editor"/,
  'live preview component should render the actual profile identity showcase in editor mode',
)

assert.match(
  previewSource,
  /PREVIEW_SOURCE_HEIGHT_PX = 640/,
  'live preview should reserve the full profile showcase source height so its bottom actions are not clipped',
)

assert.match(
  previewSource,
  /flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden/,
  'live preview rail should center the scaled profile without adding its own scroll surface',
)

assert.match(
  mutationSource,
  /selectedPrivacySettings[\s\S]+havePrivacySettingsChanged[\s\S]+userService\.updateMyPrivacySettings\(requestedPrivacySettings\)/,
  'saving the edit modal should persist changed privacy settings with the existing privacy service',
)

assert.match(
  selectSource,
  /z-\[11140\]/,
  'select dropdowns should render above dialog and popover overlays in the profile edit modal',
)

assert.match(
  dialogSource,
  /editModalTab === 'metinAnimasyonlari'[\s\S]+<UserNameStyleStudio[\s\S]+onPremiumNavigate=\{onClose\}/,
  'profile name style tab should use the name style studio and close the modal when going to premium',
)
assert.match(
  fs.readFileSync(new URL('../../src/pages/profile/UserNameStyleStudio.tsx', import.meta.url), 'utf8'),
  /<Link to='\/magaza\/premium' onClick=\{onPremiumNavigate\}>/,
  'locked users are sent to the premium page',
)

assert.doesNotMatch(
  nameStyleSource,
  /if\s*\(!hasAccess\)\s*return/,
  'locked name style users should still see the blurred picker instead of losing the whole panel',
)

assert.match(
  nameStyleSource,
  /NAME_STYLE_PRESETS[\s\S]+Modern[\s\S]+Neon[\s\S]+Glitch[\s\S]+Royal[\s\S]+Manga Ink[\s\S]+Cyber[\s\S]+Frost[\s\S]+Spectrum/,
  'name style picker should expose the visual preset grid from the modal reference',
)

assert.match(
  nameStyleSource,
  /blur-\[2px\][\s\S]+Premium.{1,2}a git/,
  'non-premium name style picker should blur the controls and show a premium CTA',
)

assert.match(
  nameStyleSource,
  /resolveNameTextColorSpec[\s\S]+getColorSwatchStyle/,
  'name style color swatches should be calculated from the color data instead of relying on incomplete CSS classes',
)

assert.match(
  dialogSource,
  /import ProfileEditProfileEffectsSection from '\.\/ProfileEditProfileEffectsSection'/,
  'profile effect tab should delegate the whole fixed-height picker section',
)

assert.match(
  profileEffectSectionSource,
  /grid-cols-\[repeat\(auto-fill,minmax\(\d+px,1fr\)\)\][\s\S]+ownedProfileEffects\.map/,
  'profile effect picker should use an auto-fill grid so large inventories scale without hard-coded columns',
)

assert.match(
  dialogSource,
  /editModalTab === 'profilEfektleri' \? \(\s*<ProfileEditProfileEffectsSection/,
  'profile effect tab should delegate to its dedicated fixed-height section that owns its own scroll',
)

assert.match(
  profileEffectSectionSource,
  /Yeni efektler ve özel tasarımlar mağazaya eklendikçe[\s\S]+Mağazaya git/,
  'profile effect picker should keep a store CTA footer below the effect grid',
)

assert.match(
  profileEffectCardSource,
  /ProfileEffectSequenceLayers active=\{isLive\}/,
  'profile effect card should only animate the live (hover/selected) card instead of autoplaying every effect',
)

assert.match(
  profileEffectCardSource,
  /resolveEffectPoster\b[\s\S]+posterAssetUrl=\{posterAssetUrl\}/,
  'inactive profile effect cards should use a lightweight poster fallback instead of autoplaying every effect',
)

assert.match(
  profileEffectCardSource,
  /\[content-visibility:auto\][\s\S]+\[contain-intrinsic-size:\d+px\]/,
  'profile effect card should use browser containment hints for large inventories',
)

assert.match(
  profileE2eSource,
  /PROFILE_E2E_EFFECTS[\s\S]+ownedProfileEffects: PROFILE_E2E_EFFECTS/,
  'profile e2e snapshot should include many profile effects for scroll regression coverage',
)

assert.match(
  dialogSource,
  /import ProfileEditFramesSection from '\.\/ProfileEditFramesSection'/,
  'frame tab should delegate the fixed-height picker section',
)

assert.match(
  dialogSource,
  /editModalTab === 'cerceveler' \? \(\s*<ProfileEditFramesSection/,
  'frame tab should delegate to its dedicated fixed-height section that owns its own scroll',
)

assert.match(
  framesSectionSource,
  /Yeni avatar çerçeveleri mağazaya eklendikçe[\s\S]+Mağazaya git/,
  'frame picker should keep a store CTA footer below the frame grid',
)

assert.match(
  framesSectionSource,
  /grid-cols-\[repeat\(auto-fill,minmax\(\d+px,1fr\)\)\][\s\S]+ownedFrameIds\.map/,
  'frame picker should use an auto-fill grid so large frame inventories scale without hard-coded columns',
)

assert.match(
  frameCardSource,
  /FrameCoverArt\b[\s\S]+active=\{isLive\}/,
  'frame card should render poster-first frame media that only goes live on hover/selection',
)

assert.match(
  frameCardSource,
  /\[content-visibility:auto\][\s\S]+\[contain-intrinsic-size:\d+px\]/,
  'frame card should use browser containment hints for large inventories',
)

assert.match(
  profileE2eSource,
  /PROFILE_E2E_FRAMES[\s\S]+ownedFrames: PROFILE_E2E_FRAMES[\s\S]+frames: PROFILE_E2E_FRAMES/,
  'profile e2e snapshot should include many frames for scroll regression coverage',
)

assert.match(
  dialogSource,
  /editModalTab === 'fansubEtiketleri' \? \([\s\S]+<ProfileEditFansubIdentitySection[\s\S]+followedFansubs=\{user\.followingFansubs\}[\s\S]+profileUserId=\{user\.id\}/,
  'fansub identity tab should render as its own fixed-height section with followed fansub context',
)

assert.match(
  fansubIdentitySectionSource,
  /lockedFollowedFansubs[\s\S]+followedFansubs\.filter\([\s\S]+!unlockedFansubRefs\.has\(fansub\.id\)/,
  'fansub identity unlock list should be based on followed fansubs that do not have supporter tags',
)

assert.match(
  fansubIdentitySectionSource,
  /flex min-h-0 flex-1 flex-col[\s\S]+Takviye Geçmişim/,
  'fansub identity tab should keep its scrollable content separate from the boost history band',
)

assert.match(
  fansubIdentitySectionSource,
  /listMyFansubBoostHistory\(\{ limit: 12, supporterUserId: profileUserId \}\)[\s\S]+historyItems\.map/,
  'boost history affordance should read real boost grant history instead of summarizing unlocked tags',
)

assert.match(
  fansubBoostServiceSource,
  /function mapMyFansubBoostHistoryRow[\s\S]+from\('fansub_boost_grants'\)[\s\S]+\.eq\('supporter_user_id', supporterUserId\)[\s\S]+\.order\('granted_at'/,
  'my boost history service should read actual fansub boost grants for the current public user',
)

assert.match(
  profileE2eSource,
  /followingFansubs:[\s\S]+crimson-scan[\s\S]+lunar-pages[\s\S]+reaper-team/,
  'profile e2e snapshot should include followed-but-not-supported fansubs for identity unlock coverage',
)

assert.match(
  dialogSource,
  /import ProfileEditBadgesSection from '\.\/ProfileEditBadgesSection'/,
  'badge tab should delegate the fixed-height badge picker section',
)

assert.match(
  dialogSource,
  /<ProfileEditBadgesSection[\s\S]+selectedBadgeIds=\{selectedBadgeIdsForDisplay\}/,
  'badge tab should delegate to its dedicated fixed-height section that owns its own scroll',
)

assert.match(
  badgesSectionSource,
  /Okuma, yorum ve topluluk görevlerini tamamladıkça rozet havuzun genişler[\s\S]+Görevlere git/,
  'badge picker should keep a task-routing footer below the badge grid',
)

assert.match(
  badgesSectionSource,
  /grid-cols-\[repeat\(auto-fill,minmax\(\d+px,1fr\)\)\][\s\S]+ownedBadges\.map/,
  'badge picker should use an auto-fill grid for large badge inventories',
)

assert.match(
  badgeCardSource,
  /selectOrder/,
  'badge picker card should surface the selected order number',
)
assert.match(
  badgesSectionSource,
  /en fazla 3 rozeti sirasiyla sec/,
  'badges section should make the three-badge ordered limit explicit',
)

assert.doesNotMatch(
  badgesSectionSource,
  /\/magaza|Magazaya Git|Mağazaya git/,
  'badge tab should not route users to the store for more badges',
)

assert.match(
  badgesSectionSource,
  /OPEN_QUICK_PANEL_EVENT[\s\S]+detail: \{ panel: 'tasks' \}/,
  'badge tab should route the more-badges CTA to the user tasks panel',
)

assert.match(
  accountTopBarSource,
  /OPEN_QUICK_PANEL_EVENT[\s\S]+openQuickPanel\(detail\.panel\)[\s\S]+addEventListener\(OPEN_QUICK_PANEL_EVENT/,
  'account top bar should accept quick-panel open requests from profile edit CTA buttons',
)

assert.match(
  appSidebarUtilsSource,
  /OPEN_QUICK_PANEL_EVENT = 'bsgmanga:open-quick-panel'/,
  'quick panel open event should be shared instead of hard-coded in profile edit badge UI',
)

assert.match(
  profileE2eSource,
  /PROFILE_E2E_BADGE_VARIANTS[\s\S]+selectedBadgeIds: ownedBadges\.slice\(0, 3\)/,
  'profile e2e snapshot should include many badges but keep the selected badge limit at three',
)

console.log('profile-edit-modal-preview-contract: ok')
