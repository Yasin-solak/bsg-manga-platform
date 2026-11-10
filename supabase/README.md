# Supabase Kurulum Rehberi

Bu klasor, BSG Manga projesinin yeni Supabase altyapisina tasinmasi icin gerekli migration dosyalarini icerir.

## Migration Sirasi

1. `supabase/migrations/20260207235901_core_schema.sql`
2. `supabase/migrations/20260207235902_functions_and_rls.sql`
3. `supabase/migrations/20260207235903_seed_minimal.sql`
4. `supabase/migrations/20260207235904_storage.sql`
5. `supabase/migrations/20260207235905_seed_showcase_data.sql`
6. `supabase/migrations/20260207235906_auth_profiles_and_username_rules.sql`
7. `supabase/migrations/20260207235907_store_assets_storage.sql`
8. `supabase/migrations/20260207235908_badge_purchase_rpc.sql`
9. `supabase/migrations/20260207235909_user_follow_rpc.sql`
10. `supabase/migrations/20260207235910_user_follow_rpc_hotfix.sql`
11. `supabase/migrations/20260207235911_manga_fansub_follow_rpc.sql`
12. `supabase/migrations/20260207235912_homepage_feed_and_indexes.sql`
13. `supabase/migrations/20260207235913_popular_manga_windows.sql`
14. `supabase/migrations/20260213235901_manga_rating_system.sql`
15. `supabase/migrations/20260213235902_manga_comments_is_pinned.sql`
16. `supabase/migrations/20260213235903_track_manga_read_rpc.sql`
17. `supabase/migrations/20260213235904_chapter_publish_schedule.sql`

Son eklenen profile background storage policy migrationi:

- `supabase/migrations/20260321235901_user_profile_background_storage_policy.sql`
- `supabase/migrations/20260321235902_legacy_user_avatar_rewrite_rpc.sql`

## Opsiyonel: Auth Demo Kullanici Esleme

Showcase seed ile gelen demo kullanicilarin gercek login yapabilmesi icin:

```bash
npm run seed:auth-users
```

Detay: `docs/auth-seed-users.md`

## Opsiyonel: Store Asset Yukleme ve Referans Gecisi

```bash
npm run seed:store-assets
```

Detay: `docs/store-assets-seed.md`

## RLS Smoke Test

`supabase/tests/rls_smoke_test.sql` dosyasi ile anon/user/admin policy kontrollerini yap.

Detay: `docs/rls-smoke-test.md`

## Feature Flag Smoke Test

`supabase/tests/feature_flag_fail_closed_smoke_test.sql` dosyasi ile kritik runtime flag'lerin kayit eksiginde fail-closed kaldigini dogrula.

Detay: `docs/feature-flag-smoke-test.md`

Opsiyonel terminal smoke:

```bash
npm run smoke:follow-rpc
npm run smoke:core-flows
```

## Uygulama Adimlari

1. Yeni Supabase projesi olustur.
2. SQL Editor uzerinden migration dosyalarini yukaridaki sirayla calistir.
3. `Authentication > URL Configuration` alaninda uygulama callback URL'lerini guncelle.
4. `.env` dosyasina sadece frontend ortam degiskenlerini gir:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. `SUPABASE_SERVICE_ROLE_KEY` gerekiyorsa repo disi admin env dosyasi kullan:
   - Varsayilan yol: `%USERPROFILE%/.bsgmanga/supabase-admin.env`
   - Alternatif: `SUPABASE_ADMIN_ENV_FILE`
6. Uygulamayi calistirip su akislari test et:
   - Kayit / giris
   - Manga listeleme / detay / bolum yukleme
   - Fansub yonetimi ve envanter
   - Topluluk gonderi/yorum
   - Magaza satin alim / rozet islemleri

## Onemli Notlar

- `service_role` anahtarini frontend kodunda, kok `.env` icinde veya repoda tutma.
- RLS politikalari aktif oldugu icin, istemci tarafindan yazma islemlerinde kullanici profil eslesmesi zorunludur.
- `purchase_store_item` ve `update_user_displayed_badges` islemleri fonksiyon uzerinden calisacak sekilde tasarlandi.
- `follow_user` ve `unfollow_user` RPC'leri takip akisinda istemci tarafi `follower_id` manipule edilmesini engeller.
- `follow_manga` / `unfollow_manga` ve `follow_fansub` / `unfollow_fansub` RPC'leri de ayni guvenlik modelini kullanir.
- `get_homepage_feed` RPC'si anasayfa verisini tek sorguda dondurur (trending/latest/fansub/topluluk/duyuru).
- `get_popular_mangas_by_views_window` RPC'si sidebar populer listesini haftalik/aylik goruntuleme penceresine gore siralar.
