import { useMemo, useState, type KeyboardEvent } from 'react'
import { Crown, FlaskConical, ShieldCheck, UserRound } from 'lucide-react'

import { FansubHoverCard, UserHoverCard } from '@/components/common/UserHoverCard'
import { FansubHoverCardSurface } from '@/components/common/FansubHoverCardSurface'
import { UserHoverCardSurface } from '@/components/common/UserHoverCardSurface'
import type { HoverCardThemeColors } from '@/components/common/hoverCardTheme'
import { normalizeHoverThemeColor } from '@/components/common/hoverCardTheme'
import { HOVER_THEME_PRESETS, type HoverThemePreset } from '@/components/common/HoverThemePicker'

import './HoverThemeLabPage.css'

type ThemeColorKey = 'mainColor' | 'accentColor'

const PROFILE_AVATAR_URL = 'https://api.dicebear.com/7.x/avataaars/svg?seed=hover-theme-premium-user'
const FANSUB_AVATAR_URL = 'https://api.dicebear.com/7.x/bottts/svg?seed=hover-theme-fansub'
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

const BANNER_BACKGROUND_STYLE = [
  'linear-gradient(to top, rgba(0,0,0,0.76), rgba(0,0,0,0.2), rgba(0,0,0,0.05))',
  'radial-gradient(circle at 74% 28%, rgba(255,102,36,0.78) 0 9px, transparent 10px)',
  'radial-gradient(circle at 64% 29%, rgba(255,102,36,0.78) 0 8px, transparent 9px)',
  'linear-gradient(135deg, #101923 0%, #1d2934 48%, #071018 100%)',
].join(', ')

const THEME_PRESETS: HoverThemePreset[] = HOVER_THEME_PRESETS

function isPresetActive(preset: HoverThemePreset, theme: HoverCardThemeColors) {
  return preset.mainColor.toLowerCase() === theme.mainColor.toLowerCase()
    && preset.accentColor.toLowerCase() === theme.accentColor.toLowerCase()
}

function HoverThemeLabPage() {
  const [theme, setTheme] = useState<HoverCardThemeColors>(THEME_PRESETS[0])
  const [themeEnabled, setThemeEnabled] = useState(true)
  const [activeColorKey, setActiveColorKey] = useState<ThemeColorKey>('mainColor')
  const [draftHex, setDraftHex] = useState<HoverCardThemeColors>(THEME_PRESETS[0])
  const appliedTheme = themeEnabled ? theme : null
  const activeColorIsInvalid = !HEX_COLOR_PATTERN.test(draftHex[activeColorKey])
  const profileHref = useMemo(() => '/profil/demo_user', [])
  const fansubHref = useMemo(() => '/fansub/bulut-ceviri', [])

  const updateColor = (key: ThemeColorKey, value: string) => {
    const safeColor = normalizeHoverThemeColor(value, theme[key])
    setTheme((current) => ({ ...current, [key]: safeColor }))
    setDraftHex((current) => ({ ...current, [key]: safeColor }))
  }

  const commitDraftColor = (key: ThemeColorKey) => {
    updateColor(key, draftHex[key])
  }

  const handleHexKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commitDraftColor(activeColorKey)
    }
  }

  return (
    <main className="hover-theme-lab" aria-label="Hover tema test sayfasi">
      <div className="hover-theme-lab__shell">
        <header className="hover-theme-lab__header">
          <div>
            <h1 className="hover-theme-lab__title">Hover Tema Laboratuvari</h1>
            <p className="hover-theme-lab__subtitle">
              Bu sayfada mock kart yok. Profil ve fansub onizlemeleri, mevcut hover yuzeyleriyle ayni anatomiyi kullanir.
              Tema; govdeye Ana &rarr; Tema Rengi gradyani uygular, banner karartmasi Ana renge akar ve metin kontrasti
              otomatik hesaplanir (acik temalarda yazi koyulasir).
            </p>
          </div>
          <span className="hover-theme-lab__status">
            <FlaskConical className="h-4 w-4" />
            Test route
          </span>
        </header>

        <div className="hover-theme-lab__grid">
          <aside className="hover-theme-lab__panel hover-theme-lab__controls" aria-label="Tema kontrolleri">
            <section>
              <p className="hover-theme-lab__section-title">Profil temasi</p>
              <h2 className="hover-theme-lab__section-heading">Renk secimi</h2>
            </section>

            <button
              type="button"
              className="hover-theme-lab__preset"
              onClick={() => setThemeEnabled((current) => !current)}
              data-active={themeEnabled}
              aria-pressed={themeEnabled}
            >
              <span
                className="hover-theme-lab__preset-preview"
                style={{
                  background: themeEnabled
                    ? `linear-gradient(180deg, ${theme.mainColor}, ${theme.accentColor})`
                    : 'var(--muted)',
                }}
                aria-hidden
              />
              <span>
                <span className="hover-theme-lab__preset-name">{themeEnabled ? 'Tema aktif' : 'Tema kapali'}</span>
                <span className="hover-theme-lab__preset-colors">
                  {themeEnabled ? 'Varsayilan gorunumle kiyaslamak icin kapat' : 'Temayi tekrar uygula'}
                </span>
              </span>
            </button>

            <div className="hover-theme-lab__swatches" role="group" aria-label="Aktif renk kanali">
              <ColorSwatchButton
                active={activeColorKey === 'mainColor'}
                color={theme.mainColor}
                label="Ana"
                onClick={() => setActiveColorKey('mainColor')}
              />
              <ColorSwatchButton
                active={activeColorKey === 'accentColor'}
                color={theme.accentColor}
                label="Tema Rengi"
                onClick={() => setActiveColorKey('accentColor')}
              />
            </div>

            <label className="hover-theme-lab__field">
              <span className="hover-theme-lab__field-label">
                {activeColorKey === 'mainColor' ? 'Ana renk' : 'Tema rengi'}
              </span>
              <span className="hover-theme-lab__field-row">
                <input
                  className="hover-theme-lab__color-input"
                  type="color"
                  value={theme[activeColorKey]}
                  onChange={(event) => updateColor(activeColorKey, event.currentTarget.value)}
                  aria-label={activeColorKey === 'mainColor' ? 'Ana renk sec' : 'Tema rengi sec'}
                />
                <input
                  className="hover-theme-lab__hex-input"
                  value={draftHex[activeColorKey]}
                  onBlur={() => commitDraftColor(activeColorKey)}
                  onChange={(event) => {
                    setDraftHex((current) => ({
                      ...current,
                      [activeColorKey]: event.currentTarget.value,
                    }))
                  }}
                  onKeyDown={handleHexKeyDown}
                  data-invalid={activeColorIsInvalid}
                  aria-invalid={activeColorIsInvalid}
                  aria-label="Hex renk kodu"
                  spellCheck={false}
                />
              </span>
            </label>

            <section className="hover-theme-lab__presets" aria-label="Hazir tema presetleri">
              <p className="hover-theme-lab__section-title">Presetler</p>
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="hover-theme-lab__preset"
                  onClick={() => {
                    setTheme({ mainColor: preset.mainColor, accentColor: preset.accentColor })
                    setDraftHex({ mainColor: preset.mainColor, accentColor: preset.accentColor })
                  }}
                  data-active={isPresetActive(preset, theme)}
                  aria-pressed={isPresetActive(preset, theme)}
                >
                  <span
                    className="hover-theme-lab__preset-preview"
                    style={{
                      background: `linear-gradient(135deg, ${preset.mainColor} 0 56%, ${preset.accentColor} 56% 100%)`,
                    }}
                    aria-hidden
                  />
                  <span>
                    <span className="hover-theme-lab__preset-name">{preset.name}</span>
                    <span className="hover-theme-lab__preset-colors">
                      {preset.mainColor} / {preset.accentColor}
                    </span>
                  </span>
                </button>
              ))}
            </section>

            <div className="hover-theme-lab__notes">
              <span><strong>Ana</strong> gradyanin ust ucu; banner karartmasi da bu renge akar.</span>
              <span><strong>Tema Rengi</strong> gradyanin alt ucu; kenarlik ve vurgu renkleri buradan turetilir.</span>
              <span>Metin, ayrac ve buton renkleri secilen renklere gore otomatik kontrast alir.</span>
            </div>
          </aside>

          <section className="hover-theme-lab__preview-stage" aria-label="Hover onizlemeleri">
            <div className="hover-theme-lab__panel hover-theme-lab__preview-header">
              <div>
                <p className="hover-theme-lab__section-title">Canli onizleme</p>
                <h2 className="hover-theme-lab__section-heading">Gercek hover yuzeyleri</h2>
              </div>
              <span className="hover-theme-lab__active-theme">
                <span
                  className="hover-theme-lab__active-dot"
                  style={{ background: theme.mainColor, color: theme.accentColor }}
                  aria-hidden
                />
                {theme.mainColor.toUpperCase()} / {theme.accentColor.toUpperCase()}
              </span>
            </div>

            <div className="hover-theme-lab__cards">
              <div className="hover-theme-lab__card-block">
                <div className="hover-theme-lab__card-label">
                  <span>Profil hover surface</span>
                  <Crown className="h-4 w-4" />
                </div>
                <div className="hover-theme-lab__surface-wrap">
                  <UserHoverCardSurface
                    className="w-full rounded-[20px]"
                    themeColors={appliedTheme}
                    hasCustomBg
                    profileBackgroundStyle={BANNER_BACKGROUND_STYLE}
                    username="demo_user"
                    displayName="Demo"
                    avatar={PROFILE_AVATAR_URL}
                    frameType="default"
                    isPremiumActive={true}
                    followerCount={1247}
                    bio="Haftalik manga listeleri, okuma notlari ve profil kozmetiklerini seven premium kullanici."
                    displayedBadges={[]}
                    fansubMemberships={[
                      { fansubId: 'bulut-ceviri', fansubName: 'Bulut Ceviri', fansubSlug: 'bulut-ceviri', role: 'editor' },
                      { fansubId: 'gecekusu-ceviri', fansubName: 'Gecekusu Ceviri', fansubSlug: 'gecekusu-ceviri', role: 'member' },
                    ]}
                    sharedFansubNames={[]}
                    profileHref={profileHref}
                    onFollowToggle={() => undefined}
                    onOpenUserReport={() => undefined}
                    onToggleBlock={() => undefined}
                    isFollowingUser={false}
                  />
                </div>
              </div>

              <div className="hover-theme-lab__card-block">
                <div className="hover-theme-lab__card-label">
                  <span>Fansub hover surface</span>
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="hover-theme-lab__surface-wrap">
                  <FansubHoverCardSurface
                    className="w-full rounded-[20px]"
                    themeColors={appliedTheme}
                    hasCustomBg
                    profileBackgroundStyle={BANNER_BACKGROUND_STYLE}
                    name="Bulut Ceviri"
                    slug="bulut-ceviri"
                    fansubHref={fansubHref}
                    avatar={FANSUB_AVATAR_URL}
                    frameType="default"
                    hasGoldFrame
                    hasDiscoverBadge
                    description="Haftalik bolum ritmi, temiz dizgi ve topluluk odakli ceviri akisiyle one cikan fansub ekibi."
                    mangaCount={38}
                    followerCount={12430}
                    participationStatus="active"
                    latestContent={{
                      mangaId: 'ay-isigi-arsivi',
                      mangaSlug: 'ay-isigi-arsivi',
                      mangaTitle: 'Ay Isigi Arsivi',
                      chapterNumber: 42,
                      chapterTitle: 'Sessiz Gecit',
                    }}
                    latestContentDateLabel="12 Haz 2026"
                    fansubId="bulut-ceviri"
                    canFollowFansub
                    isFollowingFansub={false}
                    onFollowToggle={() => undefined}
                    onReportFansub={() => undefined}
                    onBlockFansub={() => undefined}
                  />
                </div>
              </div>
            </div>

            <div className="hover-theme-lab__panel hover-theme-lab__triggers">
              <div>
                <p className="hover-theme-lab__section-title">Portal testi</p>
                <h2 className="hover-theme-lab__section-heading">Gercek hover triggerlari</h2>
              </div>
              <div className="hover-theme-lab__trigger-row" data-hover-card-boundary>
                <UserHoverCard
                  username="demo_user"
                  displayName="Demo"
                  avatar={PROFILE_AVATAR_URL}
                  bio="Hover trigger test verisi."
                  followerCount={1247}
                  frameType="default"
                  profileBackgroundStyle={BANNER_BACKGROUND_STYLE}
                  themeColors={appliedTheme}
                  isPremiumActive={true}
                  enableAutoHydration={false}
                >
                  <button type="button" className="hover-theme-lab__trigger">
                    <UserRound className="h-4 w-4" />
                    Profil hoverini ac
                  </button>
                </UserHoverCard>

                <FansubHoverCard
                  id="bulut-ceviri"
                  slug="bulut-ceviri"
                  name="Bulut Ceviri"
                  avatar={FANSUB_AVATAR_URL}
                  description="Hover trigger fansub test verisi."
                  mangaCount={38}
                  followerCount={12430}
                  frameType="default"
                  profileBackgroundStyle={BANNER_BACKGROUND_STYLE}
                  themeColors={appliedTheme}
                  hasDiscoverBadge
                  hasGoldFrame
                  canUploadStaticBackground
                  enableAutoHydration={false}
                >
                  <button type="button" className="hover-theme-lab__trigger">
                    <ShieldCheck className="h-4 w-4" />
                    Fansub hoverini ac
                  </button>
                </FansubHoverCard>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function ColorSwatchButton({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean
  color: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="hover-theme-lab__swatch"
      onClick={onClick}
      data-active={active}
      aria-pressed={active}
    >
      <span className="hover-theme-lab__swatch-preview" style={{ background: color }} aria-hidden />
      <span>
        <span className="hover-theme-lab__swatch-label">{label}</span>
        <span className="hover-theme-lab__swatch-value">{color.toUpperCase()}</span>
      </span>
    </button>
  )
}

export default HoverThemeLabPage
