-- ============================================
-- MangaZone | Enable the fansub wallet purchase flow (Part 1)
-- The economy.fansub_wallet_purchase flag turns on: in shop modals the fansub
-- admin sees the "Who are you buying for? / Payment: Fansub Vault" flow.
-- Flow + RPCs (purchase_fansub_store_item, ..._with_user_wallet,
-- purchase_store_package_for_fansub) already exist; only the flag was off.
-- Date: 2026-06-26
-- ============================================

begin;

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values (
  'economy.fansub_wallet_purchase',
  'Fansub Kasasi ile Satin Alma',
  'Magaza modallarinda fansub admini kasadan urun/paket alabilir.',
  true,
  100,
  true,
  '{}'::jsonb
)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    is_enabled = excluded.is_enabled,
    rollout_percent = excluded.rollout_percent,
    is_public = excluded.is_public,
    metadata = excluded.metadata;

commit;
