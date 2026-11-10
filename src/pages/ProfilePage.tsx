import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Link, Navigate } from '@/i18n/router'
import { LockSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import ProfileEditDialog from './profile/ProfileEditDialog'
import ProfileFollowDialog from './profile/ProfileFollowDialog'
import ProfileGenreRings from './profile/ProfileGenreRings'
import ProfileIdentityShowcase from './profile/ProfileIdentityShowcase'
import ProfileLockedView from './profile/ProfileLockedView'
import { ProfileFollowRequestsDialog } from './profile/ProfileFollowRequestsDialog'
import { useProfilePageController } from './profile/useProfilePageController'
import { assignSlot, type ProfileLayoutTab } from './profile/profileLayout'
import { ProfileShowcaseStage } from './profile/ProfileShowcaseStage'
import { ProfileStickyTabs } from './profile/ProfileStickyTabs'
import { useProfileLayout } from './profile/useProfileLayout'
import { useProfileReadingSummary } from './profile/useProfileReadingSummary'
import { ProfileOverviewTab } from './profile/ProfileOverviewTab'
import { ProfileStatsTab } from './profile/ProfileStatsTab'
import { ProfileBadgesTab, ProfileFavsTab, ProfileSideSummary, ProfileTeamsTab } from './profile/ProfileCollectionTabs'
import { ProfileAboutTab } from './profile/ProfileAboutTab'
import { ProfileListsTab } from './profile/ProfileListsTab'
import { ProfileTasksPanel } from './profile/ProfileTasksPanel'
import { PanelEmpty } from './profile/ProfileTabKit'
import { txa } from '@/i18n/activeLocale'

// v8: the "okuma-gecmisi" hash target was removed: Continue info moved to the new right
// sidebar and the overview tab no longer has a separate section.
// "favoriler" (followed series) is still a scroll target in the overview.
const PROFILE_LIBRARY_HASH_TARGETS = new Set(['favoriler'])

// Sekme cubugunun yapistigi yer: mobilde ust cubugun (56px) alti, masaustunde en ust.
const stickyTop = () => (window.matchMedia('(min-width: 1024px)').matches ? 0 : 56)

function ProfilePage() {
  const controller = useProfilePageController()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<ProfileLayoutTab>('overview')
  const librarySectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const stageRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const { layout, update: updateLayout } = useProfileLayout(controller.user?.id, controller.isOwnProfile)
  const [tabsStuck, setTabsStuck] = useState(false)
  const [transientTab, setTransientTab] = useState<ProfileLayoutTab | null>(null)
  const readingSummary = useProfileReadingSummary(controller.user?.id, Boolean(controller.canViewProfileStats))
  // Gizli hesap: takip istekleri paneli. Bildirim (?takip-istekleri=1) paneli kendiliginden acar.
  const [requestsOpen, setRequestsOpen] = useState(false)
  const incomingRequests = controller.isOwnProfile ? controller.relationship?.incomingRequests ?? 0 : 0
  useEffect(() => {
    if (controller.isOwnProfile && new URLSearchParams(location.search).has('takip-istekleri')) setRequestsOpen(true)
  }, [controller.isOwnProfile, location.search])

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const top = tabsRef.current?.getBoundingClientRect().top
      setTabsStuck(top !== undefined && top <= stickyTop() + 1)
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [controller.user?.id])

  // On tab change: with the bar stuck new content starts from the top (the page does not jump between short/long
  // tabs); no scrolling while the showcase is visible.
  const selectTab = (next: ProfileLayoutTab) => {
    setActiveTab(next)
    const top = tabsRef.current?.getBoundingClientRect().top
    if (top !== undefined && top <= stickyTop() + 1) {
      window.scrollTo({ top: window.scrollY + top - stickyTop() })
    }
  }

  const setLibrarySectionRef = (key: string) => (node: HTMLElement | null) => {
    librarySectionRefs.current[key] = node
  }

  useEffect(() => {
    const target = location.hash.replace(/^#/, '').trim()
    if (!PROFILE_LIBRARY_HASH_TARGETS.has(target)) return

    setActiveTab('overview')
    const timer = window.setTimeout(() => {
      librarySectionRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [location.hash])

  if (controller.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background py-6 text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">{txa('Profil yükleniyor...')}</span>
        </div>
      </div>
    )
  }

  if (!controller.user) {
    if (controller.notFound) {
      return <Navigate to={`/404?resource=profile&value=${encodeURIComponent(controller.username || '')}`} replace />
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background py-6 text-foreground">
        <div className="text-center">
          <p>{controller.loadError || txa('Profil bulunamadı.')}</p>
          <Button asChild variant="link" className="mt-2">
            <Link to="/">{txa('Ana Sayfaya Dön')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!controller.isOwnProfile && !controller.canViewProfile) {
    return (
      <div className="min-h-screen bg-background">
        <div className="w-full max-w-[1640px] px-4 pb-14 pt-6 sm:px-6">
          <ProfileLockedView
            currentUserExists={Boolean(controller.currentUser)}
            isFollowing={controller.isFollowing}
            isRequested={controller.isRequested}
            followBusy={controller.followBusy}
            onFollowToggle={controller.handleFollow}
            profilePrivacyGateMessage={controller.profilePrivacyGateMessage}
            theme={controller.relationship?.theme ?? controller.user.hoverTheme ?? null}
            followersCount={controller.relationship?.followersCount ?? null}
            followingCount={controller.relationship?.followingCount ?? null}
            user={controller.user}
          />
        </div>
      </div>
    )
  }

  const slotData = { user: controller.user, badges: controller.ownedBadges, lists: controller.profileLists }
  // "See all" in Overview can also temporarily open a tab closed in the layout.
  const tab = layout.tabs.includes(activeTab) || activeTab === transientTab ? activeTab : 'overview'
  const scrollToTabs = () => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const scrollToTop = () => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const hiddenStats = (
    <PanelEmpty icon={LockSimple} title={txa('İstatistikler gizli tutuluyor')} hint={txa('Bu kullanıcı okuma istatistiklerini yalnızca takipçileriyle ya da kendisiyle paylaşıyor.')} />
  )
  const tabCounts = {
    lists: controller.profileLists.length,
    badges: controller.ownedBadges.length,
    favs: controller.user.following.length,
    teams: controller.user.followingFansubs.length,
  }

  return (
    <div className="min-h-screen bg-background">
      {controller.isOwnProfile && (
        <ProfileFollowRequestsDialog open={requestsOpen} onOpenChange={setRequestsOpen} onChanged={controller.reloadRelationship} />
      )}
      <div data-page-shell className="w-full max-w-[1640px] px-4 pb-14 pt-6 sm:px-6">
        {/* Prototip v3: tam genislik vitrin (kimlik karti + iki vitrin yuvasi), altinda
            yapiskan sekme cubugu ve sekme icerigi; tur dagilimi sag sutunda. */}
        <div ref={stageRef} className="relative scroll-mt-20">
          {incomingRequests > 0 && (
            <button
              type="button"
              onClick={() => setRequestsOpen(true)}
              className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[12.5px] font-bold text-white backdrop-blur hover:bg-black/60"
              data-testid="profile-follow-requests-open"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-black text-primary-foreground">{incomingRequests}</span>
              {txa('Takip isteği')}
            </button>
          )}
          <ProfileShowcaseStage
            bg={controller.effectiveBg}
            theme={controller.user.hoverTheme ?? null}
            layout={layout}
            data={slotData}
            canEdit={controller.isOwnProfile}
            onSlotChange={(side, module) => { void updateLayout(assignSlot(layout, side, module)) }}
            onContinue={scrollToTabs}
            card={(
              <ProfileIdentityShowcase
                activeProfileEffectAssets={controller.equippedProfileEffect?.profileEffectAssets}
                canViewProfileStats={controller.canViewProfileStats}
                currentUserExists={Boolean(controller.currentUser)}
                effectiveBg={controller.effectiveBg}
                effectiveCustomFrameUrl={controller.effectiveCustomFrameUrl}
                effectivePosterFrameUrl={controller.effectivePosterFrameUrl}
                effectiveFrame={controller.effectiveFrame}
                isFollowing={controller.isFollowing}
                isMutual={controller.isMutual}
                isOwnProfile={controller.isOwnProfile}
                onEdit={controller.openEdit}
                onFollowersOpen={() => controller.setFollowersModalOpen(true)}
                onFollowToggle={controller.handleFollow}
                onFollowingOpen={() => controller.setFollowingModalOpen(true)}
                ownedBadges={controller.ownedBadges}
                profileHeaderNameClassName={controller.profileHeaderNameClassName}
                profileHeaderNameInlineStyle={controller.profileHeaderNameInlineStyle}
                themeColors={controller.user.hoverTheme ?? null}
                user={controller.user}
              />
            )}
          />
        </div>

        <div ref={tabsRef} className="scroll-mt-14 lg:scroll-mt-0" />
        <ProfileStickyTabs
          tabs={layout.tabs}
          active={tab}
          onSelect={selectTab}
          stuck={tabsStuck}
          canEdit={controller.isOwnProfile}
          onTabsChange={(tabs) => { void updateLayout({ ...layout, tabs }) }}
          onTop={scrollToTop}
          avatar={controller.user.avatar}
          name={controller.user.displayName || controller.user.username}
          counts={tabCounts}
        />

        <div data-page-grid className="mt-6 grid min-h-[calc(100svh-7rem)] content-start items-start gap-6 lg:min-h-[calc(100svh-3.5rem)] xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* key={tab}: sekme degisince icerik yumusakca girer. */}
          <main key={tab} data-page-main className="flex min-w-0 flex-col gap-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            {tab === 'overview' ? (
              <section id="favoriler" ref={setLibrarySectionRef('favoriler')} className="scroll-mt-24" data-profile-section="favoriler">
                <ProfileOverviewTab
                  user={controller.user}
                  isOwnProfile={controller.isOwnProfile}
                  canViewActivity={controller.canViewProfileLists}
                  lists={controller.profileLists}
                  listsLoading={controller.profileListsLoading}
                  summary={readingSummary.summary}
                  onOpenTab={(next) => { setTransientTab(next); selectTab(next) }}
                />
              </section>
            ) : null}

            {tab === 'stats' ? (
              controller.canViewProfileStats ? (
                <ProfileStatsTab
                  user={controller.user}
                  summary={readingSummary.summary}
                  loading={readingSummary.loading}
                  tasks={controller.isOwnProfile ? <ProfileTasksPanel currentUserId={controller.currentUser?.id} /> : null}
                />
              ) : hiddenStats
            ) : null}

            {tab === 'lists' ? (
              <ProfileListsTab
                canViewActivity={controller.canViewProfileLists}
                isOwnProfile={controller.isOwnProfile}
                lists={controller.profileLists}
                loading={controller.profileListsLoading}
              />
            ) : null}

            {tab === 'about' ? (
              <ProfileAboutTab
                user={controller.user}
                isOwnProfile={controller.isOwnProfile}
                canViewProfileStats={Boolean(controller.canViewProfileStats)}
                showTeams={!layout.tabs.includes('teams')}
                onEdit={controller.openEdit}
              />
            ) : null}

            {tab === 'badges' ? <ProfileBadgesTab badges={controller.ownedBadges} /> : null}
            {tab === 'favs' ? <ProfileFavsTab user={controller.user} /> : null}
            {tab === 'teams' ? <ProfileTeamsTab user={controller.user} /> : null}
          </main>

          <aside data-profile-right-column className="min-w-0 xl:sticky xl:top-20">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <ProfileSideSummary user={controller.user} />
              <ProfileGenreRings favoriteGenres={controller.user.favoriteGenres ?? []} />
            </div>
          </aside>
        </div>
      </div>

      {/* === MODALLER === */}
      <ProfileFollowDialog emptyText={txa('Henüz takipçi yok.')} loading={controller.followersListLoading} onOpenChange={controller.setFollowersModalOpen} open={controller.canViewProfileStats && controller.followersModalOpen} title={txa('Takipçiler')} users={controller.followersList} />
      <ProfileFollowDialog emptyText={txa('Henüz kimse takip edilmiyor.')} loading={controller.followingListLoading} onOpenChange={controller.setFollowingModalOpen} open={controller.canViewProfileStats && controller.followingModalOpen} title={txa('Takip edilenler')} users={controller.followingList} />

      {controller.isOwnProfile && controller.isEditOpen ? (
        <ProfileEditDialog
          avatarSelectionLabel={controller.avatarSelectionLabel}
          backgroundSelectionLabel={controller.backgroundSelectionLabel}
          editDraft={controller.editDraft}
          editModalTab={controller.editModalTab}
          equippedBackground={controller.equippedBackground}
          equippedFrame={controller.equippedFrame}
          effectivePosterFrameUrl={controller.effectivePosterFrameUrl}
          equippedProfileEffect={controller.equippedProfileEffect}
          hasPendingAvatarUpload={controller.hasPendingAvatarUpload}
          hasPendingBackgroundUpload={controller.hasPendingBackgroundUpload}
          hasNameTextAccess={controller.hasNameTextAccess}
          onAvatarFileChange={controller.handleAvatarFile}
          onAvatarSelectionReset={() => controller.resetPendingAvatarSelection(controller.user?.avatar)}
          onBackgroundFileChange={controller.handleBackgroundFile}
          onBackgroundReset={controller.resetBackground}
          onBackgroundSelectionReset={() => controller.resetPendingBackgroundSelection()}
          onClose={controller.closeEdit}
          onDraftChange={controller.updateEditDraft}
          onEquippedBackgroundChange={controller.setEquippedBackground}
          onEquippedFrameChange={controller.setEquippedFrame}
          onEquippedProfileEffectChange={controller.setEquippedProfileEffect}
          onOpenChange={(open) => { if (!open) controller.closeEdit() }}
          onSave={controller.saveEdit}
          onSelectedBadgeIdsChange={controller.setSelectedBadgeIds}
          onProfileVisibilityChange={controller.updateProfileVisibilityDraft}
          onPrivacySettingChange={controller.updatePrivacySettingDraft}
          onSelectedNameColorChange={controller.setSelectedNameColorId}
          onSelectedNameColorSlotChange={controller.setSelectedNameColorSlot}
          onSelectedNameEffectChange={controller.setSelectedNameEffectId}
          onSelectedNameFontChange={controller.setSelectedNameFontId}
          onSelectedNameSecondaryColorChange={controller.setSelectedNameSecondaryColorId}
          onSelectedNameMotionChange={controller.setSelectedNameMotionId}
          onSelectedNameFxChange={controller.setSelectedNameFx}
          onTabChange={controller.setEditModalTab}
          open={controller.isEditOpen}
          ownedBadges={controller.ownedBadges}
          ownedProfileEffects={controller.ownedProfileEffects}
          profileVisibility={controller.profileVisibilityDraft}
          privacySettings={controller.privacySettingsDraft}
          resolvedFrames={controller.resolvedFrames}
          saving={controller.isEditSaving}
          selectableFansubIdentityTags={controller.selectableFansubIdentityTags}
          selectedBadgeIds={controller.selectedBadgeIds}
          selectedFansubIdentityTagId={controller.selectedFansubIdentityTagId}
          selectedNameColorId={controller.selectedNameColorId}
          selectedNameColorSlot={controller.selectedNameColorSlot}
          selectedNameEffectId={controller.selectedNameEffectId}
          selectedNameFontId={controller.selectedNameFontId}
          selectedNameSecondaryColorId={controller.selectedNameSecondaryColorId}
          selectedNameMotionId={controller.selectedNameMotionId}
          selectedNameFx={controller.selectedNameFx}
          selectedNameStyleClassName={controller.selectedNameStyleClassName}
          selectedNameStyleInlineStyle={controller.selectedNameStyleInlineStyle}
          selectedHoverTheme={controller.selectedHoverTheme}
          onSelectedHoverThemeChange={controller.setSelectedHoverTheme}
          isFansubIdentityTagsLoading={controller.isFansubIdentityTagsLoading}
          onSelectedFansubIdentityTagChange={controller.setSelectedFansubIdentityTagId}
          user={controller.user}
        />
      ) : null}
    </div>
  )
}

export default ProfilePage
