# API Resilience Baseline

- API benzeri servis yuzeyi: 98
- Yuksek riskli yuzey: 33
- Timeout gap: 38
- Retry gap: 2
- select('*') yuzeyi: 0
- OpenAPI durumu: missing

## Yuksek Riskli Yuzeyler

| Dosya | Skor | Op | Timeout | Retry | Test |
| --- | ---: | ---: | --- | --- | --- |
| `src/services/authService/shared.ts` | 35 | 11 | var | var | var |
| `src/services/fansubSupporterAssetService.ts` | 31 | 9 | var | yok | yok |
| `src/services/communityService/posts.rich.ts` | 29 | 9 | var | yok | var |
| `src/services/accountCenterService.ts` | 28 | 8 | var | yok | yok |
| `src/services/adminUserDetailService/fallback.fetch.activity.ts` | 27 | 9 | var | yok | var |
| `src/services/fansubBoostService.ts` | 26 | 8 | var | yok | yok |
| `src/services/storeService/mutations.ts` | 25 | 7 | var | yok | yok |
| `src/services/userService/profiles.ts` | 25 | 7 | var | yok | yok |
| `src/services/rewardService/streakRewards.ts` | 24 | 6 | yok | yok | yok |
| `src/services/userService/follows.ts` | 22 | 6 | var | yok | yok |
| `src/services/fansubService/management.ts` | 21 | 5 | yok | yok | var |
| `src/services/adminService/shared.dashboard.ts` | 20 | 6 | var | yok | var |
| `src/services/fansubChapterCreditService.ts` | 19 | 5 | var | yok | yok |
| `src/services/fansubIdentityTagService.ts` | 19 | 5 | var | yok | yok |
| `src/services/fansubManageService/reportedContent.ts` | 19 | 5 | var | yok | yok |

- Timeout gap dosyalari: src/services/rewardService/streakRewards.ts, src/services/fansubService/management.ts, src/services/storageService/uploads.ts, src/services/userService/adminDirectory.ts, src/services/adminUserService/mutations.ts, src/services/rewardService/fansubTasks.ts, src/services/rewardService/quests.ts, src/services/rewardService/userTasks.ts, src/services/storeStudioPublicationService.ts, src/services/storageService/cloudflareUploadClient.ts, src/services/adminUserDetailService/shared.inventory.ts, src/services/storeAdminService/operations.ts, src/services/adminCommentModerationService/queries.ts, src/services/adminOpsService/featureFlags.ts, src/services/adminUserDetailService/rpc.ts, src/services/announcementService/mutations.ts, src/services/badgeService/fansubBadges.ts, src/services/badgeService/userBadges.ts, src/services/communityService/posts.popularTags.ts, src/services/fansubMembershipService/memberships.ts, src/services/featureFlagService.ts, src/services/followFeedService/feed.ts, src/services/homeService/discussion.ts, src/services/homeService/feed.ts, src/services/mangaListService/lists.ts, src/services/mangaService/discovery.list.ts, src/services/premiumPackagePublicService.ts, src/services/redeemCodeService/redeem.ts, src/services/releaseScheduleService.ts, src/services/reportService/actions.ts, src/services/storeAdminService/salesDetails.queries.item.ts, src/services/storeAdminService/salesSummary.ts, src/services/storeAnalyticsService.ts, src/services/adminOpsService/audit.ts, src/services/adminService/shared.audit.ts, src/services/adminUserDetailService/fallback.fetch.profile.ts, src/services/hoverCardService/userHover.resolve.ts, src/services/userService/onboarding.ts
- Retry gap dosyalari: src/services/storageService/cloudflareUploadClient.ts, src/services/communityGifProviderService.ts
- OpenAPI aday dosyalari: yok
