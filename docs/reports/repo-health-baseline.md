# Repo Health Baseline

- Uretim tarihi: 2026-07-09T19:39:25.817Z
- Toplam satir: 393385
- Uygulama kodu satiri: 211016
- Test/spec dosyasi: 145
- console.* cagrisi: 866
- Feature flag sayisi: 20
- Kullanilmayan feature flag: 0
- Yapilandirilmis logger kullanan dosya: 116
- User-facing error kapsami olan dosya: 69
- Request context kullanan dosya: 83
- Testsiz kritik export: 8

## Buyuk Dosyalar

| Dosya | Satir | Durum |
| --- | ---: | --- |
| `src/pages/StoreComponentsLabPage.tsx` | 940 | sert-refactor |
| `src/pages/fansub/FansubBoostOverview.tsx` | 896 | sert-refactor |
| `src/services/fansubBoostService.ts` | 887 | sert-refactor |
| `src/services/communityService/posts.rich.ts` | 872 | sert-refactor |
| `src/pages/fansub/FansubContentTabs.tsx` | 871 | sert-refactor |
| `src/testing/e2eMocks.ts` | 851 | sert-refactor |
| `src/services/authService/shared.ts` | 829 | uyari |
| `src/pages/community/useCommunityPageController.ts` | 828 | uyari |
| `src/components/admin/StoreManagementSection.tsx` | 822 | uyari |
| `src/pages/communityDetail/useCommunityDetailController.ts` | 810 | uyari |
| `src/components/community/CommunityPostCard.tsx` | 806 | uyari |
| `src/components/fansub/FansubEditModal.tsx` | 805 | uyari |
| `src/pages/storeStudio/storeStudioPreviewConfig.ts` | 794 | uyari |
| `src/pages/StorePage.tsx` | 778 | uyari |
| `src/pages/MangaListsPage.tsx` | 777 | uyari |
| `src/pages/fansubYonet/FansubYonetBoostTab.tsx` | 775 | uyari |
| `src/pages/profile/ProfileEditDialog.tsx` | 772 | uyari |
| `src/services/fansubSupporterAssetService.ts` | 771 | uyari |
| `src/pages/MangaDetailPage.tsx` | 765 | uyari |
| `src/components/admin/sections/AdminCommentModerationSection.tsx` | 763 | uyari |
| `src/components/admin/AdminRewardsSection.tsx` | 753 | uyari |
| `src/pages/fansub/useFansubDetailController.ts` | 739 | uyari |
| `src/pages/ReleaseSchedulePage.tsx` | 738 | uyari |
| `src/data/nameTextEffects.ts` | 736 | uyari |
| `src/services/storageService/uploads.ts` | 736 | uyari |
| `src/components/common/CommentThread/CommentThread.tsx` | 727 | uyari |
| `src/pages/MangaReaderPage.tsx` | 726 | uyari |
| `src/pages/fansub/FansubSupporterWall.tsx` | 720 | uyari |
| `src/pages/HomePage.tsx` | 719 | uyari |
| `src/pages/fansubYonet/FansubYonetChaptersTab.tsx` | 715 | uyari |
| `src/components/store/avatar-frame-card/AvatarFrameStorePrototypeLab.tsx` | 708 | uyari |
| `src/components/admin/sections/community/AdminCommunityContentPanel.tsx` | 697 | uyari |
| `src/components/community/CommunityQuickCreate.tsx` | 691 | uyari |
| `src/components/common/UserRewardTasksPanel.tsx` | 689 | uyari |
| `src/pages/store/useStorePageController.ts` | 679 | uyari |
| `src/components/admin/rewards/AdminQuestManagementCard.tsx` | 672 | uyari |
| `src/components/common/FansubHoverCard.tsx` | 670 | uyari |
| `src/pages/communityDetail/CommunityDetailContent.tsx` | 670 | uyari |
| `src/pages/fansubYonet/FansubYonetOverviewPanels.tsx` | 670 | uyari |
| `src/services/fansubService/catalog.ts` | 665 | uyari |
| `src/pages/fansubYonet/FansubYonetSupporterAssetsTab.tsx` | 656 | uyari |
| `src/components/common/FansubModal/FansubModal.tsx` | 649 | uyari |
| `src/components/common/NameStylePickerPanel.tsx` | 632 | uyari |
| `src/components/home/HomeRightSidebar.tsx` | 631 | uyari |
| `src/pages/fansubYonet/FansubYonetNoticesTab.tsx` | 631 | uyari |
| `src/pages/fansubYonet/FansubYonetChapterCreditTab.tsx` | 627 | uyari |
| `src/pages/ExplorePage.tsx` | 618 | uyari |
| `src/components/common/UserHoverCard.tsx` | 614 | uyari |
| `src/services/adminSupporterAssetControlService.ts` | 608 | uyari |
| `src/pages/fansubYonet/FansubYonetPostsTab.tsx` | 607 | uyari |
| `src/services/storeService/mutations.ts` | 605 | uyari |
| `src/components/admin/mangaManagement/useMangaDetailControl.ts` | 602 | uyari |

## Console Yogunlugu

| Dosya | console.* |
| --- | ---: |
| `tests/e2e/live-production-tester.spec.ts` | 27 |
| `scripts/audit-clean-store-assets.mjs` | 26 |
| `scripts/smoke-follow-rpc.mjs` | 23 |
| `scripts/migrate-legacy-media-to-r2.mjs` | 22 |
| `scripts/migrate-store-assets-to-r2.mjs` | 22 |
| `scripts/seed-karanlik-koridor-showcase.mjs` | 20 |
| `scripts/seed-store-assets.mjs` | 18 |
| `scripts/audit-anon-exposure.mjs` | 17 |
| `scripts/purge-junk-content.mjs` | 16 |
| `scripts/seed-auth-users.mjs` | 16 |
| `scripts/smoke-core-flows.mjs` | 15 |
| `scripts/audit-idor-mutations.mjs` | 14 |
| `scripts/smoke-storage-auth.mjs` | 14 |
| `tests/e2e/comments-verification-test.spec.ts` | 14 |
| `tests/e2e/comprehensive-backend-test.spec.ts` | 14 |
| `scripts/audit-privilege-escalation.mjs` | 11 |
| `scripts/reset-and-seed-manga-showcase.mjs` | 11 |
| `scripts/seed-rich-catalog.mjs` | 11 |
| `scripts/inspect-live-admin-browser.mjs` | 10 |
| `scripts/repo-health-audit.mjs` | 9 |

## Observability Hotspotlari

- src/pages/admin/useAdminCommunityHandlers.ts: console=9, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/components/admin/ops/AdminOpsSecurityAlertsPanel.tsx: console=7, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/components/fansub/FansubMembershipPanel.tsx: console=7, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/pages/ReleaseSchedulePage.tsx: console=6, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/adminService/mangaControl.mutations.feedback.ts: console=6, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/adminService/mangaControl.mutations.manga.ts: console=6, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/communityService/moderation.ts: console=6, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/mangaListService/lists.ts: console=6, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/redeemCodeService/adminUsage.ts: console=6, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/components/admin/AdminOpsSection.tsx: console=5, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/components/admin/ops/AdminOpsSecuritySection.tsx: console=5, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/communityService/comments.ts: console=5, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/communityService/posts.queries.public.ts: console=5, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/components/admin/CoinCodeManagementSection.tsx: console=4, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/components/admin/storeManagement/StorePackageManagementSection.tsx: console=4, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/pages/MangaReaderPage.tsx: console=4, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/adminMangaListService/queries.ts: console=4, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/adminService/mangaControl.detail.ts: console=4, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/badgeService/userBadges.ts: console=4, logger=false, user-facing=false, request-context=false, supheli-catch=false
- src/services/exploreConfigService.ts: console=4, logger=false, user-facing=false, request-context=false, supheli-catch=false

## User-Facing Error Coverage

- Kritik dosya kapsami: 4/4
- Kritik dosyada eksik kapsama: yok
- Supheli UI catch yuzeyi: src/components/common/CommunityCreateModal/CommunityCreateModal.tsx, src/components/community/CommunityQuickCreate.tsx, src/pages/fansub/FansubContentTabs.tsx

## Request Context Coverage

- Kritik dosya kapsami: 9/9
- Kritik dosyada eksik kapsama: yok

## Feature Flag Registry

| Flag | Kullanim | Durum |
| --- | ---: | --- |
| `home.follow_feed` | 1 | bagli |
| `home.recommendations` | 1 | bagli |
| `reader.comments` | 4 | bagli |
| `notifications.center` | 1 | bagli |
| `notifications.web_push` | 2 | bagli |
| `economy.coin_codes` | 4 | bagli |
| `economy.fansub_wallet_purchase` | 3 | bagli |
| `economy.fansub_donations` | 3 | bagli |
| `boost.system` | 5 | bagli |
| `boost.fansub_manage_tab` | 2 | bagli |
| `economy.store_purchase` | 4 | bagli |
| `community.posting` | 6 | bagli |
| `community.rich_detail` | 2 | bagli |
| `community.polls` | 5 | bagli |
| `community.gifs` | 5 | bagli |
| `community.emoji_reactions` | 3 | bagli |
| `moderation.reports` | 8 | bagli |
| `rewards.user_tasks` | 3 | bagli |
| `rewards.fansub_tasks` | 2 | bagli |
| `admin.operations_center` | 1 | bagli |

## Feature Flag Sorunlari

- yok

## Kritik Ama Testsiz Alanlar

- [x] Auth ve session: tests/contracts/auth-runtime-cost-hardening-contract.test.mjs, tests/contracts/auth-session-guard.test.mjs, tests/contracts/auth-shared-critical-exports.test.mjs, tests/contracts/supabase-auth-required-rpc-anon-cleanup-contract.test.mjs, tests/contracts/supabase-authenticated-definer-private-wrappers-contract.test.mjs, tests/contracts/supabase-authenticated-policy-helper-private-cleanup-contract.test.mjs, tests/contracts/supabase-live-release-schedule-and-session-claim-hotfix-contract.test.mjs, tests/contracts/supabase-storage-session-helper-execute-grants-contract.test.mjs
- [x] Fansub hover/detail: tests/contracts/fansub-audit-trigger-coverage-contract.test.mjs, tests/contracts/fansub-boost-background-security-contract.test.mjs, tests/contracts/fansub-boost-capability-governance-matrix-contract.test.mjs, tests/contracts/fansub-boost-contract.test.mjs, tests/contracts/fansub-boost-downgrade-governance-contract.test.mjs, tests/contracts/fansub-boost-preview-hardening-contract.test.mjs, tests/contracts/fansub-boost-public-bundle-contract.test.mjs, tests/contracts/fansub-boost-purchase-hardening-contract.test.mjs, tests/contracts/fansub-economy-rewards-contract.test.mjs, tests/contracts/fansub-manage-audit-contract.test.mjs, tests/contracts/fansub-request-flow-v2-contract.test.mjs, tests/contracts/fansub-requests-contract.test.mjs, tests/contracts/fansub-schema-compat.test.mjs, tests/contracts/fansub-showcase-and-supporter-state-contract.test.mjs, tests/contracts/fansubRewards-contract.test.mjs, tests/contracts/fansubs-page-redesign-contract.test.mjs, tests/contracts/fansubyonetoverviewtab-contract.test.mjs
- [x] Avatar poster-hover rollout: tests/contracts/avatar-frame-rollout.test.mjs, tests/contracts/hover-resolver-critical-exports.test.mjs, tests/contracts/local-avatar-upload-dev-proxy-contract.test.mjs, tests/contracts/manga-hover-redesign-contract.test.mjs, tests/contracts/supabase-avatar-public-user-path-case-fallback-contract.test.mjs, tests/contracts/supabase-avatar-storage-owner-fallback-contract.test.mjs, tests/contracts/supabase-avatar-storage-user-path-policy-contract.test.mjs, tests/contracts/supabase-avatar-upload-policy-case-short-circuit-contract.test.mjs, tests/contracts/userhover-resolve-contract.test.mjs, tests/contracts/userhovercardsurface-contract.test.mjs

## Kritik Export Coverage

- Testlenen kritik export: 31
- Testsiz kritik export: 8
  - src/services/authService/shared.ts -> clearCurrentAuthSessionSnapshotCache
  - src/services/authService/shared.ts -> clearMfaStateSummaryCache
  - src/services/authService/shared.ts -> getCurrentAccessToken
  - src/services/authService/shared.ts -> getCurrentAccountSecurityAuthSnapshot
  - src/services/authService/shared.ts -> getCurrentAuthenticatedEmail
  - src/services/authService/shared.ts -> getCurrentAuthSessionId
  - src/services/authService/shared.ts -> getCurrentAuthSessionSnapshot
  - src/services/authService/shared.ts -> getCurrentAuthUserId

## Yeni Ihlaller

- Yeni app console dosyasi: yok
- Artan console sayisi: yok
- Yeni 850+ dosya: yok
- Yeni flag sorunu: yok
- Yeni supheli UI catch: yok
- Yeni user-facing gap: yok
- Yeni request-context gap: yok

## Notlar

- Dokuman ve SQL migration dosyalari bu raporda envantere girer ama ilk dalgada otomatik bloklanmaz.
- Touched-file policy geregi buyuk dosyaya dokunuldugunda sorumluluk ayrimi beklenir.
- Yeni ihlal kapisi fail-fast mantigiyla yalniz regresyonlari hedefler.
