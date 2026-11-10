-- Profile showcase (desktop prototype v3): modules the user picks for left/right showcase slots
-- and order / visibility of profile tabs. Everyone reads (a profile visitor
-- sees the same layout); only the owner writes with set_my_profile_layout.

create table if not exists public.user_profile_layouts (
  user_id uuid primary key references public.users(id) on delete cascade,
  slot_left text not null default 'badges',
  slot_right text not null default 'reading',
  tabs text[] not null default array['overview', 'stats', 'posts', 'lists', 'about'],
  updated_at timestamptz not null default now(),
  constraint user_profile_layouts_slot_check check (
    slot_left in ('badges', 'reading', 'fav', 'list', 'post', 'stats', 'none')
    and slot_right in ('badges', 'reading', 'fav', 'list', 'post', 'stats', 'none')
    and (slot_left = 'none' or slot_left <> slot_right)
  ),
  constraint user_profile_layouts_tabs_check check (
    cardinality(tabs) between 1 and 8
    and tabs[1] = 'overview'
    and tabs <@ array['overview', 'stats', 'posts', 'lists', 'about', 'badges', 'favs', 'teams']
  )
);

alter table public.user_profile_layouts enable row level security;
drop policy if exists user_profile_layouts_select on public.user_profile_layouts;
create policy user_profile_layouts_select on public.user_profile_layouts for select to anon, authenticated using (true);
grant select on public.user_profile_layouts to anon, authenticated;

create or replace function public.set_my_profile_layout(p_slot_left text, p_slot_right text, p_tabs text[])
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_user uuid := app_private.current_public_user_id();
  v_tabs text[];
begin
  if v_user is null then
    raise exception 'Oturum gerekli.' using errcode = '42501';
  end if;
  -- Genel Bakis her zaman ilk sekme; tekrarlar atilir, sira korunur.
  select array_agg(tab order by first_pos) into v_tabs
  from (
    select tab, min(pos) as first_pos
    from unnest(array['overview'] || coalesce(p_tabs, array[]::text[])) with ordinality as t(tab, pos)
    group by tab
  ) ordered;
  insert into public.user_profile_layouts (user_id, slot_left, slot_right, tabs, updated_at)
  values (v_user, p_slot_left, p_slot_right, v_tabs, now())
  on conflict (user_id) do update set slot_left = excluded.slot_left, slot_right = excluded.slot_right,
    tabs = excluded.tabs, updated_at = now();
end;
$function$;
revoke all on function public.set_my_profile_layout(text, text, text[]) from public, anon;
grant execute on function public.set_my_profile_layout(text, text, text[]) to authenticated;
