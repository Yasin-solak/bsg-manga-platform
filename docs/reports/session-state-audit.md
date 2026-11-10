# Session State Audit

- Auth yuzeyi: 3
- Storage temas noktasi: 18
- Supabase auth kullanan dosya: 8
- Cok sekmeli destek izi: 7
- Auth user-facing gap: 0

- Storage dosyalari: src/components/community/communityUiShared.ts, src/components/ui/sidebar.tsx, src/contexts/ThemeContext.tsx, src/hooks/useSidebarCollapsed.ts, src/hooks/useTheme.ts, src/lib/communityExpressionFavorites.ts, src/pages/community/communityPageInteractions.ts, src/pages/mangaReader/readerChapterRouting.ts, src/pages/storeStudio/storeStudioPreviewConfig.ts, src/services/authService/sessionDeviceContext.ts, src/services/dbSchemaCapability.ts, src/services/featureFlagService.ts, src/services/readTrackingService.ts, src/services/readerPreferencesService.ts, src/services/releaseScheduleUserStateService.ts, src/services/selfAccountEconomyService.ts, src/services/storeService/mutations.ts, src/services/supabase.ts
- Multi-tab destek dosyalari: src/components/profileEffects/ProfileEffectLayer.tsx, src/contexts/AuthContext.tsx, src/hooks/useReaderPreferences.ts, src/pages/mangaReader/useMangaReaderData.ts, src/pages/storeStudio/storeStudioPreviewConfig.ts, src/services/authService/sessionDeviceContext.ts, src/services/featureFlagService.ts
- Auth user-facing gap dosyalari: yok

## Notlar

- Parola degisimi sonrasi tum aktif oturumlarin kapatildigina dair yerel kanit bulunamadi.
- Cookie flag denetimi icin belirgin bir kod referansi yok; Supabase tarafinda harici ayar olabilir.
