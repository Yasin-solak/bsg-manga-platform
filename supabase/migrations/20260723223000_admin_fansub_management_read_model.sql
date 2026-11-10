-- Feeds admin fansub management with a verifiable summary, a filterable list and
-- explainable trust components.
-- The trust score is computed only on the server; the client does not recompute it.

begin;

alter table public.fansubs
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz;

create index if not exists fansubs_admin_verified_created_idx
  on public.fansubs (is_verified, created_at desc);

create index if not exists fansub_members_admin_fansub_role_idx
  on public.fansub_members (fansub_id, role);

create or replace function app_private.get_admin_fansub_trust_v1(
  p_fansub_id uuid,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_fansub public.fansubs%rowtype;
  v_as_of timestamptz := coalesce(p_as_of, pg_catalog.statement_timestamp());
  v_age_days integer;
  v_has_manager boolean;
  v_last_activity_at timestamptz;
  v_total_manga integer;
  v_approved_manga integer;
  v_open_review_count integer;
  v_score integer := 50;
  v_tenure_points integer := 0;
  v_manager_points integer := 0;
  v_activity_points integer := 0;
  v_content_points integer := 0;
  v_review_points integer := 0;
  v_status_points integer := 0;
  v_evidence_count integer := 0;
  v_confidence text;
  v_band text;
  v_components jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Fansub güven bilgisi için admin yetkisi gerekir.';
  end if;

  if p_fansub_id is null then
    raise exception using errcode = '22023', message = 'Fansub kimliği boş olamaz.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Fansub bulunamadı.';
  end if;

  v_age_days := greatest(
    0,
    pg_catalog.floor(
      pg_catalog.date_part('epoch', v_as_of - v_fansub.created_at) / 86400
    )::integer
  );

  select exists (
    select 1
    from public.fansub_members as member
    where member.fansub_id = p_fansub_id
      and member.role in ('admin', 'moderator')
  )
  into v_has_manager;

  select greatest(
    (select pg_catalog.max(log.created_at) from public.fansub_audit_logs as log where log.fansub_id = p_fansub_id),
    (select pg_catalog.max(tx.created_at) from public.fansub_transactions as tx where tx.fansub_id = p_fansub_id),
    (select pg_catalog.max(manga.updated_at) from public.mangas as manga where manga.fansub_id = p_fansub_id),
    (select pg_catalog.max(chapter.updated_at) from public.chapters as chapter where chapter.fansub_id = p_fansub_id)
  )
  into v_last_activity_at;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where manga.is_approved = true)::integer
  into v_total_manga, v_approved_manga
  from public.mangas as manga
  where manga.fansub_id = p_fansub_id;

  select pg_catalog.count(*)::integer
  into v_open_review_count
  from public.fansub_reported_content as review
  where review.fansub_id = p_fansub_id
    and review.status in ('awaiting_fix', 'fix_submitted');

  v_components := v_components || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'key', 'baseline',
      'label', 'Başlangıç güveni',
      'description', 'Fansub güven modelinin nötr başlangıç değeri',
      'points', 50
    )
  );

  if v_fansub.is_verified then
    v_score := v_score + 10;
    v_evidence_count := v_evidence_count + 1;
    v_components := v_components || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key', 'verification',
        'label', 'Fansub doğrulaması',
        'description', 'Site yönetimi tarafından doğrulanmış fansub',
        'points', 10
      )
    );
  end if;

  v_tenure_points := case
    when v_age_days >= 365 then 10
    when v_age_days >= 90 then 6
    when v_age_days >= 30 then 3
    else 0
  end;
  if v_tenure_points > 0 then
    v_score := v_score + v_tenure_points;
    v_evidence_count := v_evidence_count + 1;
  end if;
  v_components := v_components || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'key', 'tenure',
      'label', 'Fansub yaşı',
      'description', pg_catalog.format('%s günlük kayıtlı fansub', v_age_days),
      'points', v_tenure_points
    )
  );

  if v_has_manager then
    v_manager_points := 8;
    v_score := v_score + v_manager_points;
    v_evidence_count := v_evidence_count + 1;
  end if;
  v_components := v_components || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'key', 'management',
      'label', 'Yetkili yönetim',
      'description', case when v_has_manager then 'Aktif yönetici veya moderatör kaydı var' else 'Aktif yetkili kaydı yok' end,
      'points', v_manager_points
    )
  );

  v_activity_points := case
    when v_last_activity_at >= v_as_of - interval '30 days' then 8
    when v_last_activity_at >= v_as_of - interval '90 days' then 4
    else 0
  end;
  if v_activity_points > 0 then
    v_score := v_score + v_activity_points;
    v_evidence_count := v_evidence_count + 1;
  end if;
  v_components := v_components || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'key', 'activity',
      'label', 'Kayıtlı aktivite',
      'description', case
        when v_last_activity_at is null then 'Doğrulanabilir aktivite kaydı yok'
        else pg_catalog.format('Son kayıtlı aktivite: %s', v_last_activity_at)
      end,
      'points', v_activity_points
    )
  );

  if v_total_manga >= 3 then
    v_content_points := case
      when v_approved_manga::numeric / v_total_manga >= 0.90 then 10
      when v_approved_manga::numeric / v_total_manga >= 0.70 then 5
      when v_approved_manga::numeric / v_total_manga < 0.50 then -10
      else 0
    end;
    v_score := v_score + v_content_points;
    v_evidence_count := v_evidence_count + 1;
  end if;
  v_components := v_components || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'key', 'content-approval',
      'label', 'İçerik onay geçmişi',
      'description', pg_catalog.format('%s içerikten %s tanesi onaylı', v_total_manga, v_approved_manga),
      'points', v_content_points
    )
  );

  if v_open_review_count > 0 then
    v_review_points := -least(25, v_open_review_count * 8);
    v_score := v_score + v_review_points;
    v_evidence_count := v_evidence_count + 1;
  end if;
  v_components := v_components || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'key', 'open-reviews',
      'label', 'Açık incelemeler',
      'description', pg_catalog.format('%s açık düzeltme kaydı', v_open_review_count),
      'points', v_review_points
    )
  );

  if not v_fansub.is_active then
    v_status_points := -15;
    v_score := v_score + v_status_points;
  end if;
  v_components := v_components || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'key', 'status',
      'label', 'Fansub durumu',
      'description', case when v_fansub.is_active then 'Fansub yayına açık' else 'Fansub pasif' end,
      'points', v_status_points
    )
  );

  v_score := greatest(0, least(100, v_score));
  v_confidence := case
    when v_age_days >= 90 and v_evidence_count >= 4 then 'high'
    when v_age_days >= 30 and v_evidence_count >= 2 then 'medium'
    else 'low'
  end;
  v_band := case
    when v_score >= 85 then 'trusted'
    when v_score >= 65 then 'standard'
    when v_score >= 40 then 'review'
    else 'high-risk'
  end;

  return pg_catalog.jsonb_build_object(
    'score', v_score,
    'band', v_band,
    'confidence', v_confidence,
    'algorithmVersion', 'fansub-trust-v1',
    'components', v_components
  );
end;
$function$;

create or replace function app_private.get_admin_fansub_management_overview(
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_as_of timestamptz := coalesce(p_as_of, pg_catalog.statement_timestamp());
  v_total integer;
  v_active integer;
  v_moderated integer;
  v_verified integer;
  v_pending_review integer;
  v_new_fansubs integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Fansub özeti için admin yetkisi gerekir.';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where fansub.is_active = true)::integer,
    pg_catalog.count(*) filter (where fansub.is_verified = true)::integer,
    pg_catalog.count(*) filter (where fansub.created_at >= v_as_of - interval '7 days')::integer
  into v_total, v_active, v_verified, v_new_fansubs
  from public.fansubs as fansub;

  select pg_catalog.count(distinct member.fansub_id)::integer
  into v_moderated
  from public.fansub_members as member
  where member.role in ('admin', 'moderator');

  select pg_catalog.count(distinct review.fansub_id)::integer
  into v_pending_review
  from public.fansub_reported_content as review
  where review.status in ('awaiting_fix', 'fix_submitted');

  return pg_catalog.jsonb_build_object(
    'total', coalesce(v_total, 0),
    'active', coalesce(v_active, 0),
    'moderated', coalesce(v_moderated, 0),
    'verified', coalesce(v_verified, 0),
    'pendingReview', coalesce(v_pending_review, 0),
    'newFansubs', coalesce(v_new_fansubs, 0),
    'verificationAvailable', true,
    'trustAvailable', true
  );
end;
$function$;

create or replace function public.get_admin_fansub_management_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_fansub_management_overview(
    pg_catalog.statement_timestamp()
  );
$function$;

create or replace function app_private.list_admin_fansub_management_page(
  p_page integer,
  p_limit integer,
  p_search text,
  p_view text,
  p_trust text,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_page integer := coalesce(p_page, 1);
  v_limit integer := coalesce(p_limit, 10);
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  v_view text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_view, 'all')));
  v_trust text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_trust, 'all')));
  v_as_of timestamptz := coalesce(p_as_of, pg_catalog.statement_timestamp());
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Fansub listesi için admin yetkisi gerekir.';
  end if;

  if v_page < 1 then
    raise exception using errcode = '22023', message = 'Sayfa numarası en az 1 olmalıdır.';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = '22023', message = 'Sayfa limiti 1 ile 50 arasında olmalıdır.';
  end if;
  if v_search is not null and pg_catalog.char_length(v_search) > 160 then
    raise exception using errcode = '22023', message = 'Arama metni en fazla 160 karakter olabilir.';
  end if;
  if v_view not in ('all', 'active', 'inactive', 'verified', 'new') then
    raise exception using errcode = '22023', message = 'Geçersiz fansub görünümü.';
  end if;
  if v_trust not in ('all', 'trusted', 'standard', 'review') then
    raise exception using errcode = '22023', message = 'Geçersiz güven filtresi.';
  end if;

  with scoped as materialized (
    select
      fansub.id,
      fansub.name,
      fansub.slug,
      fansub.avatar_url,
      fansub.description,
      fansub.is_active,
      fansub.manga_count,
      fansub.follower_count,
      fansub.coin_balance,
      fansub.created_at,
      fansub.updated_at,
      fansub.is_verified,
      fansub.verified_at,
      coalesce(member_stats.member_count, 0) as member_count,
      coalesce(member_stats.moderator_count, 0) as moderator_count,
      case when manager.id is null then null else pg_catalog.jsonb_build_object(
        'id', manager.id,
        'username', manager.username,
        'avatarUrl', manager.avatar_url
      ) end as manager,
      activity.last_activity_at,
      coalesce(review.pending_review_count, 0) as pending_review_count,
      coalesce(boost.tier_level, 0) as boost_level,
      trust.payload as trust
    from public.fansubs as fansub
    left join lateral (
      select
        pg_catalog.count(*)::integer as member_count,
        pg_catalog.count(*) filter (where member.role in ('admin', 'moderator'))::integer as moderator_count
      from public.fansub_members as member
      where member.fansub_id = fansub.id
    ) as member_stats on true
    left join lateral (
      select
        app_user.id,
        app_user.username,
        app_user.avatar_url
      from public.fansub_members as member
      join public.users as app_user on app_user.id = member.user_id
      where member.fansub_id = fansub.id
        and member.role in ('admin', 'moderator')
      order by case member.role when 'admin' then 0 when 'moderator' then 1 else 2 end, member.created_at
      limit 1
    ) as manager on true
    left join lateral (
      select greatest(
        (select pg_catalog.max(log.created_at) from public.fansub_audit_logs as log where log.fansub_id = fansub.id),
        (select pg_catalog.max(tx.created_at) from public.fansub_transactions as tx where tx.fansub_id = fansub.id),
        (select pg_catalog.max(manga.updated_at) from public.mangas as manga where manga.fansub_id = fansub.id),
        (select pg_catalog.max(chapter.updated_at) from public.chapters as chapter where chapter.fansub_id = fansub.id)
      ) as last_activity_at
    ) as activity on true
    left join lateral (
      select pg_catalog.count(*)::integer as pending_review_count
      from public.fansub_reported_content as item
      where item.fansub_id = fansub.id
        and item.status in ('awaiting_fix', 'fix_submitted')
    ) as review on true
    left join public.fansub_boost_snapshots as boost on boost.fansub_id = fansub.id
    cross join lateral (
      select app_private.get_admin_fansub_trust_v1(fansub.id, v_as_of) as payload
    ) as trust
    where (
      v_search is null
      or fansub.name ilike '%' || v_search || '%'
      or fansub.slug ilike '%' || v_search || '%'
      or fansub.id::text = v_search
      or manager.username ilike '%' || v_search || '%'
    )
      and (
        v_view = 'all'
        or (v_view = 'active' and fansub.is_active = true)
        or (v_view = 'inactive' and fansub.is_active = false)
        or (v_view = 'verified' and fansub.is_verified = true)
        or (v_view = 'new' and fansub.created_at >= v_as_of - interval '7 days')
      )
      and (
        v_trust = 'all'
        or trust.payload ->> 'band' = v_trust
        or (v_trust = 'review' and trust.payload ->> 'band' = 'high-risk')
      )
  ),
  paged as materialized (
    select *
    from scoped
    order by updated_at desc, name, id
    offset (v_page - 1) * v_limit
    limit v_limit
  )
  select pg_catalog.jsonb_build_object(
    'data',
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', paged.id,
          'name', paged.name,
          'slug', paged.slug,
          'avatarUrl', paged.avatar_url,
          'description', paged.description,
          'isActive', paged.is_active,
          'mangaCount', paged.manga_count,
          'followerCount', paged.follower_count,
          'coinBalance', paged.coin_balance,
          'createdAt', paged.created_at,
          'updatedAt', paged.updated_at,
          'memberCount', paged.member_count,
          'moderatorCount', paged.moderator_count,
          'manager', paged.manager,
          'lastActivityAt', paged.last_activity_at,
          'pendingReviewCount', paged.pending_review_count,
          'isVerified', paged.is_verified,
          'verifiedAt', paged.verified_at,
          'trust', paged.trust,
          'boostLevel', paged.boost_level
        )
        order by paged.updated_at desc, paged.name, paged.id
      ),
      '[]'::jsonb
    ),
    'count', (select pg_catalog.count(*) from scoped),
    'page', v_page,
    'limit', v_limit
  )
  into v_result
  from paged;

  return coalesce(v_result, pg_catalog.jsonb_build_object(
    'data', '[]'::jsonb,
    'count', 0,
    'page', v_page,
    'limit', v_limit
  ));
end;
$function$;

create or replace function public.list_admin_fansub_management_page(
  p_page integer default 1,
  p_limit integer default 10,
  p_search text default null,
  p_view text default 'all',
  p_trust text default 'all'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.list_admin_fansub_management_page(
    p_page,
    p_limit,
    p_search,
    p_view,
    p_trust,
    pg_catalog.statement_timestamp()
  );
$function$;

create or replace function app_private.admin_set_fansub_verified(
  p_fansub_id uuid,
  p_is_verified boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_previous boolean;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Fansub doğrulaması için admin yetkisi gerekir.';
  end if;
  if p_fansub_id is null or p_is_verified is null then
    raise exception using errcode = '22023', message = 'Fansub kimliği ve doğrulama durumu zorunludur.';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 500 then
    raise exception using errcode = '22023', message = 'Doğrulama notu en fazla 500 karakter olabilir.';
  end if;

  select fansub.is_verified
  into v_previous
  from public.fansubs as fansub
  where fansub.id = p_fansub_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Fansub bulunamadı.';
  end if;

  update public.fansubs
  set
    is_verified = p_is_verified,
    verified_at = case when p_is_verified then pg_catalog.statement_timestamp() else null end,
    updated_at = pg_catalog.statement_timestamp()
  where id = p_fansub_id;

  select app_private.current_public_user_id()
  into v_actor_id;

  insert into public.fansub_audit_logs (
    fansub_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    summary,
    metadata
  )
  values (
    p_fansub_id,
    v_actor_id,
    'site_admin',
    'fansub.verification.update',
    'fansub',
    p_fansub_id::text,
    case when p_is_verified then 'Fansub doğrulandı.' else 'Fansub doğrulaması kaldırıldı.' end,
    pg_catalog.jsonb_build_object(
      'previousIsVerified', v_previous,
      'isVerified', p_is_verified,
      'note', v_note
    )
  );

  return pg_catalog.jsonb_build_object(
    'fansubId', p_fansub_id,
    'isVerified', p_is_verified,
    'previousIsVerified', v_previous
  );
end;
$function$;

create or replace function public.admin_set_fansub_verified(
  p_fansub_id uuid,
  p_is_verified boolean,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.admin_set_fansub_verified(
    p_fansub_id,
    p_is_verified,
    p_note
  );
$function$;

revoke all on function app_private.get_admin_fansub_trust_v1(uuid, timestamptz) from public;
revoke all on function app_private.get_admin_fansub_management_overview(timestamptz) from public;
revoke all on function app_private.list_admin_fansub_management_page(integer, integer, text, text, text, timestamptz) from public;
revoke all on function app_private.admin_set_fansub_verified(uuid, boolean, text) from public;
revoke all on function public.get_admin_fansub_management_overview() from public;
revoke all on function public.list_admin_fansub_management_page(integer, integer, text, text, text) from public;
revoke all on function public.admin_set_fansub_verified(uuid, boolean, text) from public;

grant execute on function app_private.get_admin_fansub_trust_v1(uuid, timestamptz) to authenticated, service_role;
grant execute on function app_private.get_admin_fansub_management_overview(timestamptz) to authenticated, service_role;
grant execute on function app_private.list_admin_fansub_management_page(integer, integer, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function app_private.admin_set_fansub_verified(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.get_admin_fansub_management_overview() to authenticated, service_role;
grant execute on function public.list_admin_fansub_management_page(integer, integer, text, text, text) to authenticated, service_role;
grant execute on function public.admin_set_fansub_verified(uuid, boolean, text) to authenticated, service_role;

comment on function app_private.get_admin_fansub_trust_v1(uuid, timestamptz) is
  'Açıklanabilir fansub-trust-v1 puanını yalnız admin bağlamında üretir.';
comment on function public.get_admin_fansub_management_overview() is
  'Admin Fansub Yönetimi ekranının doğrulanabilir üst metriklerini döndürür.';
comment on function public.list_admin_fansub_management_page(integer, integer, text, text, text) is
  'Admin Fansub Yönetimi için sayfalı, filtrelenebilir ve açıklanabilir güven özetli liste döndürür.';
comment on function public.admin_set_fansub_verified(uuid, boolean, text) is
  'Fansub doğrulamasını admin kontrolü, satır kilidi ve audit kaydıyla günceller.';

commit;
