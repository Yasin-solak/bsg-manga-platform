-- Shop v3 reminders: when a reader says "Hatirlat" a notification goes when a campaign starts / a product goes on sale
-- . Every 5 minutes, at most 500 notifications per round.

create or replace function app_private.shop_dispatch_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_sent integer := 0;
  v_row record;
begin
  for v_row in
    select r.user_id, r.target_kind, r.target_id,
           coalesce(c.headline, c.name) as campaign_title, c.slug as campaign_slug,
           p.title as product_title, p.slug as product_slug
    from public.shop_reminders r
    left join public.shop_campaigns c on r.target_kind = 'campaign' and c.id = r.target_id
    left join public.shop_products p on r.target_kind = 'product' and p.id = r.target_id
    where r.notified_at is null
      and (
        (r.target_kind = 'campaign' and c.status = 'published' and c.starts_at <= now() and c.ends_at > now())
        or (r.target_kind = 'product' and app_private.shop_product_state(p.id, now()) = 'live')
      )
    order by r.created_at
    limit 500
  loop
    if v_row.target_kind = 'campaign' then
      perform public.push_notification(
        v_row.user_id, 'system', 'Magazada yeni kampanya',
        format('"%s" basladi. Kacirmadan goz at.', v_row.campaign_title),
        jsonb_build_object('event', 'shop_campaign_started', 'campaign_slug', v_row.campaign_slug, 'href', '/magaza'),
        null::text
      );
    else
      perform public.push_notification(
        v_row.user_id, 'system', 'Bekledigin urun satista',
        format('"%s" artik magazada.', v_row.product_title),
        jsonb_build_object('event', 'shop_product_live', 'product_slug', v_row.product_slug, 'href', '/magaza/urun/' || v_row.product_slug),
        null::text
      );
    end if;
    update public.shop_reminders set notified_at = now()
    where user_id = v_row.user_id and target_kind = v_row.target_kind and target_id = v_row.target_id;
    v_sent := v_sent + 1;
  end loop;

  update public.shop_campaigns set notified_at = now()
  where status = 'published' and starts_at <= now() and notified_at is null;

  return v_sent;
end;
$$;

revoke all on function app_private.shop_dispatch_reminders() from public;

select cron.schedule('shop-v3-reminders', '*/5 * * * *', 'select app_private.shop_dispatch_reminders();');
