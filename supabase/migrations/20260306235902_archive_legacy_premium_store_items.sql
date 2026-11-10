-- ============================================
-- MangaZone | Legacy premium store item archive
-- Date: 2026-03-06
-- ============================================

begin;

-- Instead of a hard delete we deactivate legacy premium products.
-- Past purchase and subscription references are kept.
update public.store_items si
set is_active = true
from public.premium_runtime_config cfg
where cfg.id = true
  and si.id = cfg.premium_store_item_id
  and si.type = 'premium'
  and si.is_active is distinct from true;

update public.store_items si
set is_active = false
from public.premium_runtime_config cfg
where cfg.id = true
  and si.type = 'premium'
  and si.id <> cfg.premium_store_item_id
  and si.is_active is distinct from false;

commit;
