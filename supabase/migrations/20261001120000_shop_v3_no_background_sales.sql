-- Shop v3: profile backgrounds are not sold (product decision). Backgrounds readers own
-- stay and keep working; only sales in the shop close.
-- 1) Published / scheduled background products are archived.
-- 2) A background product can never be published again.
-- 3) No background part can be added to any product (including bundles).

update public.shop_products
set status = 'archived', updated_at = now()
where display_type = 'background' and status <> 'archived';

create or replace function app_private.shop_block_background_product()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.display_type = 'background' and new.status <> 'archived' then
    raise exception 'Profil arka planı mağazada satılmıyor.';
  end if;
  return new;
end;
$$;

drop trigger if exists shop_products_no_background on public.shop_products;
create trigger shop_products_no_background
  before insert or update of display_type, status on public.shop_products
  for each row execute function app_private.shop_block_background_product();

create or replace function app_private.shop_block_background_grant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.store_items si where si.id = new.store_item_id and si.type = 'background') then
    raise exception 'Profil arka planı mağazada satılmıyor; ürüne eklenemez.';
  end if;
  return new;
end;
$$;

drop trigger if exists shop_product_grants_no_background on public.shop_product_grants;
create trigger shop_product_grants_no_background
  before insert or update of store_item_id on public.shop_product_grants
  for each row execute function app_private.shop_block_background_grant();

revoke all on function app_private.shop_block_background_product() from public;
revoke all on function app_private.shop_block_background_grant() from public;
