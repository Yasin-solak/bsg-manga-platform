-- Shop: a notification when a wishlist product goes on sale (like a Steam wishlist).
-- Every 15 minutes: if the reader price (shop_quote) of a wishlist product on sale is below list price due to a
-- discount / deal of the day and no notice was sent at this price (or a cheaper one)
-- a notification goes. When the discount ends the mark resets; on the next
-- discount the notice goes again. A Premium member price alone does not count as a "discount" (no notification rain
-- on every product).

alter table public.shop_wishlist add column if not exists sale_notified_price integer;

create or replace function app_private.shop_dispatch_wishlist_sales()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_sent integer := 0;
  v_row record;
  v_quote jsonb;
  v_price integer;
  v_list integer;
  v_on_sale boolean;
begin
  for v_row in
    select w.user_id, w.product_id, w.sale_notified_price, p.title, p.slug
    from public.shop_wishlist w
    join public.shop_products p on p.id = w.product_id
    where app_private.shop_product_state(p.id, now()) = 'live'
    order by w.created_at
    limit 2000
  loop
    v_quote := app_private.shop_quote(v_row.product_id, v_row.user_id, null);
    if v_quote is null then
      continue;
    end if;
    v_price := (v_quote ->> 'price')::integer;
    v_list := (v_quote ->> 'listPrice')::integer;
    v_on_sale := coalesce((v_quote ->> 'purchasable')::boolean, false)
      and v_price < v_list
      and (v_quote ->> 'source') in ('discount', 'daily_deal');

    if v_on_sale then
      if v_row.sale_notified_price is null or v_price < v_row.sale_notified_price then
        perform public.push_notification(
          v_row.user_id,
          'system',
          'Istek listendeki urun indirimde',
          format('"%s" simdi %s Coin (%s yerine).', v_row.title, v_price, v_list),
          jsonb_build_object(
            'event', 'shop_wishlist_sale',
            'product_slug', v_row.slug,
            'price', v_price,
            'list_price', v_list,
            'route_hint', '/magaza?urun=' || v_row.slug,
            'event_key', format('shop-wishlist-sale:%s:%s:%s', v_row.user_id, v_row.product_id, v_price)
          ),
          null::text
        );
        update public.shop_wishlist set sale_notified_price = v_price
        where user_id = v_row.user_id and product_id = v_row.product_id;
        v_sent := v_sent + 1;
      end if;
    elsif v_row.sale_notified_price is not null then
      update public.shop_wishlist set sale_notified_price = null
      where user_id = v_row.user_id and product_id = v_row.product_id;
    end if;
  end loop;
  return v_sent;
end;
$$;

revoke all on function app_private.shop_dispatch_wishlist_sales() from public;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'shop-v3-wishlist-sales') then
    perform cron.unschedule('shop-v3-wishlist-sales');
  end if;
  perform cron.schedule('shop-v3-wishlist-sales', '*/15 * * * *', 'select app_private.shop_dispatch_wishlist_sales();');
end;
$$;
