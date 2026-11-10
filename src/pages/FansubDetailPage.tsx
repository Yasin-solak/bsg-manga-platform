import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Navigate, useNavigate, useSearchParams } from '@/i18n/router'
import { Loader2 } from 'lucide-react'
import { FANSUB_DONATE_QUERY_PARAM } from '@/lib/routes'
import FansubDonateDialog from '@/components/fansub/FansubDonateDialog'
import FansubEditModal from '@/components/fansub/FansubEditModal'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { purchaseFansubBoost } from '@/services/fansubBoostService'
import { toast } from '@/services/toastService'
import FansubShowcaseCard from './fansub/FansubShowcaseHero'
import FansubDiscordInviteCard from './fansub/FansubDiscordInviteCard'
import FansubShowcaseMangaDialog from './fansub/FansubShowcaseMangaDialog'
import FansubContentTabs from './fansub/FansubContentTabs'
import { BoostPurchaseDialog } from './fansub/FansubBoostDialogs'
import { useFansubDetailController } from './fansub/useFansubDetailController'
import { FansubCoverWall, FansubSideSummary, FansubStageRecentChapters, FansubStageSeries } from './fansub/FansubStageModules'
import { coverAmbience, toStageBackground, toStageTheme } from './fansub/fansubStageMedia'
import { FANSUB_DETAIL_RELEASES_TAB } from '@/lib/fansubNotices'
import { ShowcaseStage } from './profile/ProfileShowcaseStage'
import { txa } from '@/i18n/activeLocale'

function FansubLoadingState() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background py-6 text-foreground">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{txa('Fansub yükleniyor...')}</p>
    </div>
  )
}

function FansubLoadErrorState({
  message,
  onBack,
}: {
  message: string
  onBack: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background py-6 text-foreground">
      <div className="text-center">
        <p className="text-muted-foreground">{message}</p>
        <Button className="mt-4" onClick={onBack}>
          {txa('Fansublar sayfasına dön')}
        </Button>
      </div>
    </div>
  )
}

function FansubDetailPage() {
  const controller = useFansubDetailController()
  const { currentUser, updateCurrentUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const fansubId = controller.fansub?.id ?? null
  const [isShowcaseMangaDialogOpen, setIsShowcaseMangaDialogOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const tabsAnchorRef = useRef<HTMLDivElement>(null)

  const [isBoostDialogOpen, setIsBoostDialogOpen] = useState(false)
  const [boostQuantity, setBoostQuantity] = useState(1)
  const [supporterNote, setSupporterNote] = useState('')
  const [isPurchasing, setIsPurchasing] = useState(false)

  const boostPlan = useMemo(() => {
    const plans = controller.boostPlans || []
    const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder)
    return sorted[0] ?? null
  }, [controller.boostPlans])

  const boostProgress = useMemo(() => {
    const snap = controller.boostSnapshot
    if (!snap) return null
    return {
      activePower: snap.activePower ?? 0,
      currentTierLevel: snap.tierLevel ?? 0,
      nextTierLevel: snap.nextTierLevel ?? null,
      nextTierRequiredPower: snap.nextTierRequiredPower ?? null,
      nextTierRemainingPower: snap.nextTierRemainingPower ?? 0,
      tierProgressPercent: snap.tierProgressPercent ?? 0,
    }
  }, [controller.boostSnapshot])

  const handleBoostClick = useCallback(() => {
    if (!currentUser) {
      navigate('/giris', { state: { from: `${location.pathname}${location.search}${location.hash}` } })
      return
    }
    setBoostQuantity(1)
    setIsBoostDialogOpen(true)
  }, [currentUser, location, navigate])

  const handlePurchase = useCallback(async () => {
    if (!boostPlan || !controller.fansub) return

    setIsPurchasing(true)
    try {
      const result = await purchaseFansubBoost({
        fansubId: controller.fansub.id,
        planCode: boostPlan.code,
        supporterNote: supporterNote.trim() || null,
        quantity: boostQuantity,
      })

      updateCurrentUser({ stones: result.newUserStones })
      controller.handleBoostPurchaseSuccess(result)

      setIsBoostDialogOpen(false)
      setSupporterNote('')
      setBoostQuantity(1)

      toast.success(txa('{name} için takviye tamamlandı (x{count}).', { name: controller.fansub.name, count: boostQuantity }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Takviye satın alma başarısız oldu.'))
    } finally {
      setIsPurchasing(false)
    }
  }, [boostPlan, boostQuantity, controller, supporterNote, updateCurrentUser])

  // Donation deep link: the reader's chapter end strip comes here with `?bagis=1`
  // and the dialog opens directly (otherwise page + button = two steps).
  // The parameter is cleared once consumed; back/refresh does not reopen the dialog.
  const donateRequested = searchParams.get(FANSUB_DONATE_QUERY_PARAM) === '1'
  const openDonateDialog = controller.openDonateDialog
  useEffect(() => {
    if (!donateRequested || !fansubId) return
    openDonateDialog()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete(FANSUB_DONATE_QUERY_PARAM)
      return next
    }, { replace: true })
  }, [donateRequested, fansubId, openDonateDialog, setSearchParams])

  if (controller.loading) return <FansubLoadingState />

  if (!controller.fansub) {
    if (controller.notFound) {
      return (
        <Navigate
          to={`/404?resource=fansub&value=${encodeURIComponent(controller.id || '')}`}
          replace
        />
      )
    }

    return (
      <FansubLoadErrorState
        message={controller.loadError || txa('Fansub bulunamadı.')}
        onBack={controller.goBackToFansubs}
      />
    )
  }

  const scrollToTabs = () => tabsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const scrollToTop = () => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // "All" links in showcase modules open the related tab and scroll to the tab area.
  const openTab = (tab: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tab', tab)
      return next
    }, { replace: true })
    scrollToTabs()
  }
  const stageBg = toStageBackground(controller.effectiveBg)
  // Tema (v2) hem sahneyi hem kartin govdesini boyar; takviye bitince ikisi de notr.
  const stageTheme = toStageTheme(controller.fansub.hoverTheme, controller.boostSnapshot?.capabilities)

  return (
    <div className="min-h-screen bg-background">
      {/* Kullanici profiliyle ayni duzen: tam genislik vitrin (ortada fansub karti, iki yanda
          son bolumler / seriler), altinda yapiskan sekme cubugu, sekme icerigi ve sag sutun. */}
      <div data-page-shell className="w-full max-w-[1640px] px-4 pb-14 pt-6 sm:px-6">
        <div ref={stageRef} className="scroll-mt-20">
          <ShowcaseStage
            testId="fansub-showcase-stage"
            bg={stageBg ?? coverAmbience(controller.sortedMangas)}
            theme={stageTheme}
            backdrop={stageBg ? null : <FansubCoverWall mangas={controller.sortedMangas} />}
            onContinue={scrollToTabs}
            continueLabel={txa('Fansubun devamı')}
            continueHint={txa('Takviye · Mangalar · Duyurular · Ekip · Takvim')}
            left={<FansubStageRecentChapters chapters={controller.chapterPreviews} onShowAll={() => openTab(FANSUB_DETAIL_RELEASES_TAB)} />}
            right={(
              <FansubStageSeries
                mangas={controller.sortedMangas}
                members={controller.members}
                onShowAll={() => setIsShowcaseMangaDialogOpen(true)}
                onShowTeam={() => openTab('ekip')}
              />
            )}
            card={(
              <div className="flex w-full justify-center">
                <FansubShowcaseCard
                  fansub={controller.fansub}
                  canManage={controller.isFansubAdmin}
                  isFollowing={controller.isFollowing}
                  followersCount={controller.fansub.followerCount || 0}
                  chapterPreviews={controller.chapterPreviews}
                  activeProfileEffectAssets={controller.activeProfileEffectAssets}
                  effectiveBg={controller.effectiveBg}
                  effectiveFrame={controller.effectiveFrame}
                  effectiveCustomFrameUrl={controller.effectiveCustomFrameUrl}
                  effectivePosterFrameUrl={controller.effectivePosterFrameUrl}
                  fansubHeaderNameClassName={controller.fansubHeaderNameClassName}
                  fansubHeaderNameInlineStyle={controller.fansubHeaderNameInlineStyle}
                  isBoostEnabled={controller.isBoostEnabled}
                  boostSnapshot={controller.boostSnapshot}
                  ownedBadges={controller.ownedBadges}
                  manageHref={controller.fansub.id ? `/fansub/${controller.fansub.id}/yonet` : undefined}
                  onEdit={controller.openEdit}
                  onFollowToggle={controller.handleFollow}
                  onDonate={controller.openDonateDialog}
                  onBoost={handleBoostClick}
                  onMangaClick={() => setIsShowcaseMangaDialogOpen(true)}
                  themeColors={stageTheme}
                />
              </div>
            )}
          />
        </div>

        <div ref={tabsAnchorRef} className="scroll-mt-14 lg:scroll-mt-0" />
        <FansubContentTabs
          fansubId={controller.fansub.id}
          fansubSlug={controller.fansub.slug}
          fansubName={controller.fansub.name}
          fansubAvatar={controller.fansub.avatar}
          isBoostEnabled={controller.isBoostEnabled}
          boostSnapshot={controller.boostSnapshot}
          supporterState={controller.supporterState}
          supporterPreview={controller.supporterPreview}
          recentDonationPreview={controller.recentDonationPreview}
          boostPlans={controller.boostPlans}
          currentUserCoins={controller.currentUserCoins}
          isFansubAdmin={controller.isFansubAdmin}
          onBoostPurchaseSuccess={controller.handleBoostPurchaseSuccess}
          mangas={controller.sortedMangas}
          canSeePending={controller.canSeePending}
          members={controller.members}
          chapters={controller.chapterPreviews}
          pinnedNotices={controller.pinnedNotices}
          stage={{
            onTop: scrollToTop,
            aside: (
              <>
                <FansubSideSummary
                  mangaCount={controller.sortedMangas.length}
                  chapters={controller.chapterPreviews}
                  followerCount={controller.fansub.followerCount || 0}
                  members={controller.members}
                />
                {controller.fansub.discordInviteUrl ? (
                  <FansubDiscordInviteCard
                    fansubName={controller.fansub.name}
                    discordInviteUrl={controller.fansub.discordInviteUrl}
                  />
                ) : null}
              </>
            ),
          }}
        />
      </div>

      {controller.isEditOpen && (
        <FansubEditModal
          avatarSelectionLabel={controller.avatarSelectionLabel}
          backgroundSelectionLabel={controller.backgroundSelectionLabel}
          activeProfileEffectAssets={controller.activeProfileEffectAssets}
          activeProfileEffectId={controller.effectiveProfileEffectId}
          boostSnapshot={controller.boostSnapshot}
          editDraft={controller.editDraft}
          editModalTab={controller.editModalTab}
          effectiveBg={controller.effectiveBg}
          effectiveBgId={controller.effectiveBg?.id}
          effectiveCustomFrameUrl={controller.effectiveCustomFrameUrl}
          effectivePosterFrameUrl={controller.effectivePosterFrameUrl}
          effectiveFrame={controller.effectiveFrame}
          failedVideoUrls={controller.failedVideoUrls}
          fansub={controller.fansub}
          fansubHeaderNameClassName={controller.selectedNameStyleClassName}
          fansubHeaderNameInlineStyle={controller.selectedNameStyleInlineStyle}
          followersCount={controller.fansub.followerCount || 0}
          hasPendingAvatarUpload={Boolean(controller.avatarUploadFile)}
          hasPendingBackgroundUpload={Boolean(controller.backgroundUploadFile)}
          hasNameTextAccess={controller.hasNameTextAccess}
          hasVanityUrlAccess={controller.hasVanityUrlAccess}
          handleAvatarFile={controller.handleAvatarFile}
          handleBackgroundFile={controller.handleBackgroundFile}
          isOpen={controller.isEditOpen}
          isBoostEnabled={controller.isBoostEnabled}
          markVideoAsFailed={controller.markVideoFailed}
          membersCount={controller.members.length}
          onAvatarSelectionReset={controller.resetAvatarSelection}
          onBackgroundSelectionReset={controller.resetBackgroundSelection}
          onClose={controller.closeEdit}
          onOpenBoost={() => {
            controller.closeEdit()
            handleBoostClick()
          }}
          onSave={controller.saveEdit}
          onSelectedNameColorChange={controller.setSelectedNameColorId}
          onSelectedNameColorSlotChange={controller.setSelectedNameColorSlot}
          onSelectedNameEffectChange={controller.setSelectedNameEffectId}
          onSelectedNameFontChange={controller.setSelectedNameFontId}
          onSelectedNameSecondaryColorChange={controller.setSelectedNameSecondaryColorId}
          onSelectedNameFxChange={controller.setSelectedNameFx}
          selectedNameFx={controller.selectedNameFx}
          ownedBackgrounds={controller.fansub.ownedBackgrounds ?? []}
          ownedProfileEffects={controller.ownedProfileEffects}
          ownedBadges={controller.ownedBadges}
          ownedFrameInfos={controller.ownedFrameInfos}
          ownedFrames={controller.fansub.ownedFrames ?? []}
          rawFrame={controller.rawFrame as string}
          saving={controller.isEditSaving}
          selectedBadgeIds={controller.selectedBadgeIds}
          selectedNameColorId={controller.resolvedSelectedNameColorId}
          selectedNameColorSlot={controller.selectedNameColorSlot}
          selectedNameEffectId={controller.resolvedSelectedNameEffectId}
          selectedNameFontId={controller.resolvedSelectedNameFontId}
          selectedNameSecondaryColorId={controller.resolvedSelectedNameSecondaryColorId}
          selectedNameStyleInlineStyle={controller.selectedNameStyleInlineStyle}
          uploadProgressLabel={controller.uploadProgressLabel}
          uploadProgressPercent={controller.uploadProgressPercent}
          setEditModalTab={controller.setEditModalTab}
          setEquippedBackground={controller.setEquippedBackground}
          setEquippedFrame={controller.setEquippedFrame}
          setEquippedProfileEffectId={controller.setEquippedProfileEffectId}
          setSelectedBadgeIds={controller.setSelectedBadgeIds}
          updateEditDraft={controller.updateEditDraft}
        />
      )}

      <FansubDonateDialog
        open={controller.isDonateDialogOpen}
        saving={controller.isDonationSaving}
        fansubName={controller.fansub.name}
        currentUserCoins={controller.currentUserCoins}
        amountInput={controller.donationAmountInput}
        note={controller.donationNote}
        confirmationInput={controller.donationConfirmationInput}
        isConfirmationValid={controller.isDonationConfirmationValid}
        normalizedAmount={controller.normalizedDonationAmount}
        onAmountInputChange={controller.setDonationAmountInput}
        onNoteChange={controller.setDonationNote}
        onConfirmationInputChange={controller.setDonationConfirmationInput}
        onAmountPresetSelect={(value) => controller.setDonationAmountInput(String(value))}
        onOpenChange={(open) => {
          if (controller.isDonationSaving) return
          controller.setIsDonateDialogOpen(open)
        }}
        onCancel={() => controller.setIsDonateDialogOpen(false)}
        onSubmit={controller.handleDonateSubmit}
      />

      {controller.isBoostEnabled && controller.fansub ? (
        <BoostPurchaseDialog
          open={isBoostDialogOpen}
          onOpenChange={setIsBoostDialogOpen}
          fansubName={controller.fansub.name}
          plan={boostPlan}
          quantity={boostQuantity}
          onQuantityChange={setBoostQuantity}
          currentUserCoins={controller.currentUserCoins}
          supporterNote={supporterNote}
          onSupporterNoteChange={setSupporterNote}
          isSubmitting={isPurchasing}
          onSubmit={handlePurchase}
          progress={boostProgress}
        />
      ) : null}

      {controller.fansub ? (
        <FansubShowcaseMangaDialog
          open={isShowcaseMangaDialogOpen}
          onOpenChange={setIsShowcaseMangaDialogOpen}
          fansubName={controller.fansub.name}
          mangas={controller.sortedMangas}
        />
      ) : null}
    </div>
  )
}

export default FansubDetailPage

