-- Shop v3: a light signal for the Shop button in the sidebar. Without loading the whole showcase:
-- is there a live campaign, season, discount or deal of the day, which matters most, when it ends.
-- Public (including anon); only published and unexpired records are read.

create or replace function public.shop_nav_signal()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_settings public.shop_settings%rowtype;
  v_campaign record;
  v_season record;
  v_discount integer;
  v_discount_ends timestamptz;
  v_deal integer;
begin
  select * into v_settings from public.shop_settings where id;

  select c.name, coalesce(c.headline, c.name) as title, c.kind, c.ends_at
    into v_campaign
  from public.shop_campaigns c
  where c.status = 'published' and c.starts_at <= v_now and c.ends_at > v_now and c.kind <> 'premium_month'
  order by case c.kind when 'sale' then 0 when 'limited' then 1 when 'launch' then 2 else 3 end, c.ends_at
  limit 1;

  select s.name, s.ends_at into v_season
  from public.shop_seasons s
  where s.status = 'published' and s.starts_at <= v_now and s.ends_at > v_now
  order by s.ends_at
  limit 1;

  select max(d.value), min(d.ends_at) into v_discount, v_discount_ends
  from public.shop_discounts d
  where d.status = 'published' and d.discount_type = 'percent' and d.audience = 'everyone'
    and (d.starts_at is null or d.starts_at <= v_now) and (d.ends_at is null or d.ends_at > v_now);

  if coalesce(v_settings.daily_deal_enabled, false) then
    select d.percent into v_deal from app_private.shop_daily_deal(v_day) d;
  end if;

  return jsonb_build_object(
    'campaign', case when v_campaign.title is null then null else jsonb_build_object('title', v_campaign.title, 'kind', v_campaign.kind, 'endsAt', v_campaign.ends_at) end,
    'season', case when v_season.name is null then null else jsonb_build_object('name', v_season.name, 'endsAt', v_season.ends_at) end,
    'discountPercent', v_discount,
    'discountEndsAt', v_discount_ends,
    'dealPercent', v_deal,
    'dealEndsAt', case when v_deal is null then null else ((v_day + 1)::timestamp at time zone 'Europe/Istanbul') end
  );
end;
$$;

revoke all on function public.shop_nav_signal() from public;
grant execute on function public.shop_nav_signal() to anon, authenticated;
