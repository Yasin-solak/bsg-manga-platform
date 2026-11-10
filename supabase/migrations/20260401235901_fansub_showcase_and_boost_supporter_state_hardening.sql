begin;

create or replace function public.assert_fansub_identifier_rules(
  p_name text,
  p_slug text
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if char_length(v_name) < 3 then
    raise exception 'Fansub adi en az 3 karakter olmali.';
  end if;

  if char_length(v_name) > 32 then
    raise exception 'Fansub adi en fazla 32 karakter olabilir.';
  end if;

  if char_length(v_slug) < 3 then
    raise exception 'Fansub slug en az 3 karakter olmali.';
  end if;

  if char_length(v_slug) > 40 then
    raise exception 'Fansub slug en fazla 40 karakter olabilir.';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Fansub slug yalnizca kucuk harf, rakam ve tire icerebilir.';
  end if;
end;
$$;

grant execute on function public.assert_fansub_identifier_rules(text, text) to anon, authenticated;

create or replace function public.guard_fansub_identifier_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.name := trim(coalesce(new.name, ''));
  new.slug := lower(trim(coalesce(new.slug, '')));

  perform public.assert_fansub_identifier_rules(new.name, new.slug);
  return new;
end;
$$;

drop trigger if exists trg_fansub_identifier_rules on public.fansubs;
create trigger trg_fansub_identifier_rules
  before insert or update of name, slug on public.fansubs
  for each row
  execute function public.guard_fansub_identifier_rules();

create or replace function public.guard_fansub_request_identifier_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.requested_name := trim(coalesce(new.requested_name, ''));
  new.requested_slug := lower(trim(coalesce(new.requested_slug, '')));

  perform public.assert_fansub_identifier_rules(new.requested_name, new.requested_slug);
  return new;
end;
$$;

drop trigger if exists trg_fansub_request_identifier_rules on public.fansub_requests;
create trigger trg_fansub_request_identifier_rules
  before insert or update of requested_name, requested_slug on public.fansub_requests
  for each row
  execute function public.guard_fansub_request_identifier_rules();

create or replace function public.maybe_refresh_fansub_boost_supporter_state(
  p_fansub_id uuid,
  p_supporter_user_id uuid
)
returns public.fansub_boost_supporter_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.fansub_boost_supporter_states%rowtype;
begin
  if p_fansub_id is null or p_supporter_user_id is null then
    raise exception 'Fansub ve destekci kimligi zorunludur.';
  end if;

  select *
  into v_state
  from public.fansub_boost_supporter_states s
  where s.fansub_id = p_fansub_id
    and s.supporter_user_id = p_supporter_user_id
  limit 1;

  if not found then
    return public.refresh_fansub_boost_supporter_state(p_fansub_id, p_supporter_user_id);
  end if;

  if v_state.active_until is not null and v_state.active_until <= now() then
    return public.refresh_fansub_boost_supporter_state(p_fansub_id, p_supporter_user_id);
  end if;

  if coalesce(v_state.updated_at, to_timestamp(0)) <= now() - interval '5 minutes' then
    return public.refresh_fansub_boost_supporter_state(p_fansub_id, p_supporter_user_id);
  end if;

  return v_state;
end;
$$;

grant execute on function public.maybe_refresh_fansub_boost_supporter_state(uuid, uuid) to authenticated;

drop function if exists public.get_my_fansub_boost_supporter_state(uuid);

create function public.get_my_fansub_boost_supporter_state(
  p_fansub_id uuid
)
returns table (
  fansub_id uuid,
  supporter_user_id uuid,
  active_grant_count integer,
  active_total_power integer,
  highest_active_plan_code text,
  supporter_reward_tier integer,
  reward_capabilities jsonb,
  active_until timestamptz,
  lifetime_grant_count integer,
  lifetime_total_power integer,
  latest_supporter_note text,
  is_visible boolean,
  last_granted_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_state public.fansub_boost_supporter_states%rowtype;
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  v_state := public.maybe_refresh_fansub_boost_supporter_state(p_fansub_id, v_user_id);

  return query
  select
    v_state.fansub_id,
    v_state.supporter_user_id,
    v_state.active_grant_count,
    v_state.active_total_power,
    v_state.highest_active_plan_code,
    v_state.supporter_reward_tier,
    v_state.reward_capabilities,
    v_state.active_until,
    v_state.lifetime_grant_count,
    v_state.lifetime_total_power,
    v_state.latest_supporter_note,
    v_state.is_visible,
    v_state.last_granted_at;
end;
$$;

grant execute on function public.get_my_fansub_boost_supporter_state(uuid) to authenticated;

commit;
