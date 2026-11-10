# Test Strategy Audit

- Toplam test dosyasi: 141
- Contract test: 128
- E2E test: 13
- Unit-benzeri test: 0
- Flaky aday: 15
- Mutation test destegi: var

- Kritik testsiz moduller: src/pages/StoreComponentsLabPage.tsx, src/services/fansubBoostService.ts, src/pages/storeStudio/storeStudioPreviewConfig.ts, src/pages/StorePage.tsx, src/pages/fansubYonet/FansubYonetBoostTab.tsx, src/services/fansubSupporterAssetService.ts, src/pages/fansubYonet/FansubYonetChaptersTab.tsx, src/components/common/FansubHoverCard.tsx, src/pages/fansubYonet/FansubYonetOverviewPanels.tsx, src/services/fansubService/catalog.ts, src/pages/fansubYonet/FansubYonetSupporterAssetsTab.tsx, src/components/common/FansubModal/FansubModal.tsx, src/pages/fansubYonet/FansubYonetNoticesTab.tsx, src/pages/fansubYonet/FansubYonetChapterCreditTab.tsx, src/components/common/UserHoverCard.tsx, src/pages/fansubYonet/FansubYonetPostsTab.tsx, src/services/storeService/mutations.ts, src/pages/fansubYonet/ReportedPostFixDialog.tsx, src/components/common/userHoverCardShared.ts, src/contexts/AuthContext.tsx
- Flaky aday testler: tests/contracts/api-resilience-contract.test.mjs, tests/contracts/auth-session-guard.test.mjs, tests/contracts/store-explore-sandbox-contract.test.mjs, tests/contracts/store-search-and-gift-modal-contract.test.mjs, tests/e2e/admin-boost-downgrade-smoke.spec.ts, tests/e2e/chapter-credit-management.spec.ts, tests/e2e/chapter-credit-visual-smoke.spec.ts, tests/e2e/comments-verification-test.spec.ts, tests/e2e/comprehensive-backend-test.spec.ts, tests/e2e/live-production-tester.spec.ts, tests/e2e/manga-comment-report.spec.ts, tests/e2e/root-render-smoke.spec.ts, tests/e2e/store-flow.spec.ts, tests/e2e/store-profile-effect-gift.spec.ts, tests/e2e/supporter-assets-studio-and-composer-smoke.spec.ts

## Bosluklar

- Bazi kritik moduller icin eslesen test bulunamadi.
