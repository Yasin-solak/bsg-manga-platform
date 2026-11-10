-- Community detail and rich engagement infrastructure:
-- 1) add post asset/gif tables
-- 2) add post poll tables and vote RPC
-- 3) add post emoji reaction table and summary RPCs
-- 4) add view/share counters and tracking functions

alter table public.community_posts
  add column if not exists views_count bigint not null default 0,
  add column if not exists shares_count bigint not null default 0,
  add column if not exists reactions_count bigint not null default 0,
  add column if not exists poll_votes_count bigint not null default 0;

create table if not exists public.community_post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.community_posts(id) on delete cascade,
  asset_type text not null check (asset_type in ('gif')),
  provider text not null check (provider in ('tenor')),
  provider_asset_id text not null,
  original_url text not null,
  preview_url text not null,
  width integer not null default 0,
  height integer not null default 0,
  alt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_post_assets_provider_idx
  on public.community_post_assets (provider, provider_asset_id);

drop trigger if exists trg_community_post_assets_updated_at on public.community_post_assets;
create trigger trg_community_post_assets_updated_at
before update on public.community_post_assets
for each row execute function public.set_updated_at();

create table if not exists public.community_post_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.community_posts(id) on delete cascade,
  closes_at timestamptz not null,
  total_votes_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_community_post_polls_updated_at on public.community_post_polls;
create trigger trg_community_post_polls_updated_at
before update on public.community_post_polls
for each row execute function public.set_updated_at();

create table if not exists public.community_post_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.community_post_polls(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  label text not null,
  votes_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, position)
);

create index if not exists community_post_poll_options_poll_idx
  on public.community_post_poll_options (poll_id, position);

drop trigger if exists trg_community_post_poll_options_updated_at on public.community_post_poll_options;
create trigger trg_community_post_poll_options_updated_at
before update on public.community_post_poll_options
for each row execute function public.set_updated_at();

create table if not exists public.community_post_poll_votes (
  poll_id uuid not null references public.community_post_polls(id) on delete cascade,
  option_id uuid not null references public.community_post_poll_options(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists community_post_poll_votes_option_idx
  on public.community_post_poll_votes (option_id);

drop trigger if exists trg_community_post_poll_votes_updated_at on public.community_post_poll_votes;
create trigger trg_community_post_poll_votes_updated_at
before update on public.community_post_poll_votes
for each row execute function public.set_updated_at();

create table if not exists public.community_post_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null check (emoji in ('😂', '😮', '😢', '🔥', '👏')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_post_reactions_emoji_idx
  on public.community_post_reactions (emoji);

drop trigger if exists trg_community_post_reactions_updated_at on public.community_post_reactions;
create trigger trg_community_post_reactions_updated_at
before update on public.community_post_reactions
for each row execute function public.set_updated_at();

create table if not exists public.community_post_view_events (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  viewer_key text not null,
  created_date date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (post_id, viewer_key, created_date)
);

create index if not exists community_post_view_events_created_idx
  on public.community_post_view_events (created_at desc);

alter table public.community_post_assets enable row level security;
alter table public.community_post_polls enable row level security;
alter table public.community_post_poll_options enable row level security;
alter table public.community_post_poll_votes enable row level security;
alter table public.community_post_reactions enable row level security;
alter table public.community_post_view_events enable row level security;

drop policy if exists community_post_assets_select_rule on public.community_post_assets;
create policy community_post_assets_select_rule
  on public.community_post_assets
  for select
  using (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (
          (cp.status = 'approved' and cp.is_active = true)
          or cp.author_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists community_post_assets_insert_self_or_admin on public.community_post_assets;
create policy community_post_assets_insert_self_or_admin
  on public.community_post_assets
  for insert
  with check (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_assets_update_self_or_admin on public.community_post_assets;
create policy community_post_assets_update_self_or_admin
  on public.community_post_assets
  for update
  using (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_assets_delete_self_or_admin on public.community_post_assets;
create policy community_post_assets_delete_self_or_admin
  on public.community_post_assets
  for delete
  using (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_polls_select_rule on public.community_post_polls;
create policy community_post_polls_select_rule
  on public.community_post_polls
  for select
  using (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (
          (cp.status = 'approved' and cp.is_active = true)
          or cp.author_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists community_post_polls_insert_self_or_admin on public.community_post_polls;
create policy community_post_polls_insert_self_or_admin
  on public.community_post_polls
  for insert
  with check (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_polls_update_self_or_admin on public.community_post_polls;
create policy community_post_polls_update_self_or_admin
  on public.community_post_polls
  for update
  using (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_polls_delete_self_or_admin on public.community_post_polls;
create policy community_post_polls_delete_self_or_admin
  on public.community_post_polls
  for delete
  using (
    exists (
      select 1
      from public.community_posts cp
      where cp.id = post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_poll_options_select_rule on public.community_post_poll_options;
create policy community_post_poll_options_select_rule
  on public.community_post_poll_options
  for select
  using (
    exists (
      select 1
      from public.community_post_polls cpp
      join public.community_posts cp on cp.id = cpp.post_id
      where cpp.id = poll_id
        and (
          (cp.status = 'approved' and cp.is_active = true)
          or cp.author_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
  );

drop policy if exists community_post_poll_options_insert_self_or_admin on public.community_post_poll_options;
create policy community_post_poll_options_insert_self_or_admin
  on public.community_post_poll_options
  for insert
  with check (
    exists (
      select 1
      from public.community_post_polls cpp
      join public.community_posts cp on cp.id = cpp.post_id
      where cpp.id = poll_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_poll_options_update_self_or_admin on public.community_post_poll_options;
create policy community_post_poll_options_update_self_or_admin
  on public.community_post_poll_options
  for update
  using (
    exists (
      select 1
      from public.community_post_polls cpp
      join public.community_posts cp on cp.id = cpp.post_id
      where cpp.id = poll_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.community_post_polls cpp
      join public.community_posts cp on cp.id = cpp.post_id
      where cpp.id = poll_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_poll_options_delete_self_or_admin on public.community_post_poll_options;
create policy community_post_poll_options_delete_self_or_admin
  on public.community_post_poll_options
  for delete
  using (
    exists (
      select 1
      from public.community_post_polls cpp
      join public.community_posts cp on cp.id = cpp.post_id
      where cpp.id = poll_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  );

drop policy if exists community_post_poll_votes_select_own_or_admin on public.community_post_poll_votes;
create policy community_post_poll_votes_select_own_or_admin
  on public.community_post_poll_votes
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_post_poll_votes_insert_own on public.community_post_poll_votes;
create policy community_post_poll_votes_insert_own
  on public.community_post_poll_votes
  for insert
  with check (user_id = public.current_public_user_id());

drop policy if exists community_post_poll_votes_update_own_or_admin on public.community_post_poll_votes;
create policy community_post_poll_votes_update_own_or_admin
  on public.community_post_poll_votes
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_post_poll_votes_delete_own_or_admin on public.community_post_poll_votes;
create policy community_post_poll_votes_delete_own_or_admin
  on public.community_post_poll_votes
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_post_reactions_select_own_or_admin on public.community_post_reactions;
create policy community_post_reactions_select_own_or_admin
  on public.community_post_reactions
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_post_reactions_insert_own on public.community_post_reactions;
create policy community_post_reactions_insert_own
  on public.community_post_reactions
  for insert
  with check (user_id = public.current_public_user_id());

drop policy if exists community_post_reactions_update_own_or_admin on public.community_post_reactions;
create policy community_post_reactions_update_own_or_admin
  on public.community_post_reactions
  for update
  using (user_id = public.current_public_user_id() or public.is_admin())
  with check (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_post_reactions_delete_own_or_admin on public.community_post_reactions;
create policy community_post_reactions_delete_own_or_admin
  on public.community_post_reactions
  for delete
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists community_post_view_events_deny_select on public.community_post_view_events;
create policy community_post_view_events_deny_select
  on public.community_post_view_events
  for select
  using (public.is_admin());

drop policy if exists community_post_view_events_insert_admin_only on public.community_post_view_events;
create policy community_post_view_events_insert_admin_only
  on public.community_post_view_events
  for insert
  with check (public.is_admin());

create or replace function public.sync_community_post_reactions_count(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post_id is null then
    return;
  end if;

  update public.community_posts cp
  set
    reactions_count = coalesce((
      select count(*)::bigint
      from public.community_post_reactions cpr
      where cpr.post_id = p_post_id
    ), 0),
    updated_at = now()
  where cp.id = p_post_id;
end;
$$;

create or replace function public.sync_community_post_poll_counts(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  if p_poll_id is null then
    return;
  end if;

  select cpp.post_id
  into v_post_id
  from public.community_post_polls cpp
  where cpp.id = p_poll_id;

  if v_post_id is null then
    return;
  end if;

  update public.community_post_poll_options cppo
  set votes_count = coalesce((
    select count(*)::bigint
    from public.community_post_poll_votes cppv
    where cppv.option_id = cppo.id
  ), 0)
  where cppo.poll_id = p_poll_id;

  update public.community_post_polls cpp
  set
    total_votes_count = coalesce((
      select count(*)::bigint
      from public.community_post_poll_votes cppv
      where cppv.poll_id = p_poll_id
    ), 0),
    updated_at = now()
  where cpp.id = p_poll_id;

  update public.community_posts cp
  set
    poll_votes_count = coalesce((
      select cpp.total_votes_count
      from public.community_post_polls cpp
      where cpp.id = p_poll_id
    ), 0),
    updated_at = now()
  where cp.id = v_post_id;
end;
$$;

create or replace function public.get_community_post_poll(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll record;
  v_actor_id uuid;
  v_viewer_option_id uuid;
  v_viewer_has_voted boolean := false;
  v_payload jsonb;
begin
  if p_post_id is null then
    return null;
  end if;

  select cp.id as post_id, cp.status, cp.is_active, cpp.id as poll_id, cpp.closes_at, cpp.total_votes_count
  into v_poll
  from public.community_posts cp
  join public.community_post_polls cpp on cpp.post_id = cp.id
  where cp.id = p_post_id;

  if v_poll.poll_id is null then
    return null;
  end if;

  if not (
    (v_poll.status = 'approved' and v_poll.is_active = true)
    or v_poll.post_id in (
      select cp.id
      from public.community_posts cp
      where cp.id = p_post_id
        and (cp.author_id = public.current_public_user_id() or public.is_admin())
    )
  ) then
    return null;
  end if;

  v_actor_id := public.current_public_user_id();
  if v_actor_id is not null then
    select cppv.option_id
    into v_viewer_option_id
    from public.community_post_poll_votes cppv
    where cppv.poll_id = v_poll.poll_id
      and cppv.user_id = v_actor_id
    limit 1;

    v_viewer_has_voted := v_viewer_option_id is not null;
  end if;

  select jsonb_build_object(
    'id', v_poll.poll_id,
    'postId', p_post_id,
    'closesAt', v_poll.closes_at,
    'isClosed', (v_poll.closes_at <= now()),
    'totalVotesCount', coalesce(v_poll.total_votes_count, 0),
    'viewerHasVoted', v_viewer_has_voted,
    'viewerOptionId', v_viewer_option_id,
    'options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cppo.id,
          'label', cppo.label,
          'position', cppo.position,
          'votesCount', cppo.votes_count
        )
        order by cppo.position asc
      )
      from public.community_post_poll_options cppo
      where cppo.poll_id = v_poll.poll_id
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$$;

create or replace function public.vote_community_post_poll(
  p_post_id uuid,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_poll_id uuid;
  v_poll_post_id uuid;
  v_is_closed boolean := false;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  select cpp.id, cpp.post_id, cpp.closes_at <= now()
  into v_poll_id, v_poll_post_id, v_is_closed
  from public.community_post_polls cpp
  where cpp.post_id = p_post_id;

  if v_poll_id is null then
    raise exception 'Anket bulunamadi.';
  end if;

  if v_is_closed then
    raise exception 'Bu anket kapanmis.';
  end if;

  perform 1
  from public.community_post_poll_options cppo
  where cppo.id = p_option_id
    and cppo.poll_id = v_poll_id;

  if not found then
    raise exception 'Secilen anket secenegi gecerli degil.';
  end if;

  if exists (
    select 1
    from public.community_post_poll_votes cppv
    where cppv.poll_id = v_poll_id
      and cppv.user_id = v_actor_id
  ) then
    raise exception 'Bu ankete zaten oy verdiniz.';
  end if;

  insert into public.community_post_poll_votes (poll_id, option_id, user_id)
  values (v_poll_id, p_option_id, v_actor_id);

  perform public.sync_community_post_poll_counts(v_poll_id);
  return public.get_community_post_poll(v_poll_post_id);
end;
$$;

create or replace function public.get_community_post_reaction_summary(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_current_emoji text;
  v_payload jsonb;
begin
  if p_post_id is null then
    return jsonb_build_object(
      'currentEmoji', null,
      'totalCount', 0,
      'items', '[]'::jsonb
    );
  end if;

  select emoji
  into v_current_emoji
  from public.community_post_reactions
  where post_id = p_post_id
    and user_id = public.current_public_user_id()
  limit 1;

  select jsonb_build_object(
    'currentEmoji', v_current_emoji,
    'totalCount', coalesce((
      select count(*)::bigint
      from public.community_post_reactions cpr
      where cpr.post_id = p_post_id
    ), 0),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'emoji', summary.emoji,
          'count', summary.reaction_count
        )
        order by summary.reaction_count desc, summary.emoji asc
      )
      from (
        select cpr.emoji, count(*)::bigint as reaction_count
        from public.community_post_reactions cpr
        where cpr.post_id = p_post_id
        group by cpr.emoji
      ) summary
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$$;

create or replace function public.set_community_post_reaction(
  p_post_id uuid,
  p_emoji text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_normalized_emoji text;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_post_id is null then
    raise exception 'Post bilgisi zorunludur.';
  end if;

  perform 1
  from public.community_posts cp
  where cp.id = p_post_id
    and cp.is_active = true
    and cp.status = 'approved'
  for update;

  if not found then
    raise exception 'Post bulunamadi veya aktif degil.';
  end if;

  v_normalized_emoji := nullif(btrim(coalesce(p_emoji, '')), '');
  if v_normalized_emoji is not null and v_normalized_emoji not in ('😂', '😮', '😢', '🔥', '👏') then
    raise exception 'Gecersiz reaction secimi.';
  end if;

  if v_normalized_emoji is null then
    delete from public.community_post_reactions
    where post_id = p_post_id
      and user_id = v_actor_id;
  else
    insert into public.community_post_reactions (post_id, user_id, emoji)
    values (p_post_id, v_actor_id, v_normalized_emoji)
    on conflict (post_id, user_id)
    do update set emoji = excluded.emoji, updated_at = now();
  end if;

  perform public.sync_community_post_reactions_count(p_post_id);
  return public.get_community_post_reaction_summary(p_post_id);
end;
$$;

create or replace function public.get_community_post_asset(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', cpa.id,
    'postId', cpa.post_id,
    'assetType', cpa.asset_type,
    'provider', cpa.provider,
    'providerAssetId', cpa.provider_asset_id,
    'originalUrl', cpa.original_url,
    'previewUrl', cpa.preview_url,
    'width', cpa.width,
    'height', cpa.height,
    'altText', cpa.alt_text
  )
  from public.community_post_assets cpa
  join public.community_posts cp on cp.id = cpa.post_id
  where cpa.post_id = p_post_id
    and (
      (cp.status = 'approved' and cp.is_active = true)
      or cp.author_id = public.current_public_user_id()
      or public.is_admin()
    )
  limit 1;
$$;

create or replace function public.track_community_post_view(
  p_post_id uuid,
  p_viewer_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean := false;
begin
  if p_post_id is null or nullif(btrim(coalesce(p_viewer_key, '')), '') is null then
    return jsonb_build_object('counted', false);
  end if;

  insert into public.community_post_view_events (post_id, viewer_key)
  values (p_post_id, btrim(p_viewer_key))
  on conflict do nothing;

  v_inserted := found;

  if v_inserted then
    update public.community_posts
    set
      views_count = coalesce(views_count, 0) + 1,
      updated_at = now()
    where id = p_post_id;
  end if;

  return jsonb_build_object('counted', v_inserted);
end;
$$;

create or replace function public.track_community_post_share(
  p_post_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share_count bigint := 0;
begin
  if p_post_id is null then
    raise exception 'Post bilgisi zorunludur.';
  end if;

  update public.community_posts
  set
    shares_count = coalesce(shares_count, 0) + 1,
    updated_at = now()
  where id = p_post_id
  returning shares_count into v_share_count;

  return jsonb_build_object(
    'post_id', p_post_id,
    'shares_count', v_share_count
  );
end;
$$;

revoke all on function public.get_community_post_poll(uuid) from public;
grant execute on function public.get_community_post_poll(uuid) to anon, authenticated;

revoke all on function public.vote_community_post_poll(uuid, uuid) from public;
grant execute on function public.vote_community_post_poll(uuid, uuid) to authenticated;

revoke all on function public.get_community_post_reaction_summary(uuid) from public;
grant execute on function public.get_community_post_reaction_summary(uuid) to anon, authenticated;

revoke all on function public.set_community_post_reaction(uuid, text) from public;
grant execute on function public.set_community_post_reaction(uuid, text) to authenticated;

revoke all on function public.get_community_post_asset(uuid) from public;
grant execute on function public.get_community_post_asset(uuid) to anon, authenticated;

revoke all on function public.track_community_post_view(uuid, text) from public;
grant execute on function public.track_community_post_view(uuid, text) to anon, authenticated;

revoke all on function public.track_community_post_share(uuid) from public;
grant execute on function public.track_community_post_share(uuid) to anon, authenticated;
