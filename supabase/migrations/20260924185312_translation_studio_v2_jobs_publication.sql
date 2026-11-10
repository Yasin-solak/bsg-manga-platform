-- Translation Studio V2: content version, cost quota and leased job dedupe.

alter table public.studio_projects
  add column content_revision bigint not null default 1 check (content_revision > 0);

-- Clean base or layout changes make the existing publish stale.
-- A target language translation is a separate layer; its change does not raise the clean base version.
create or replace function app_private.studio_content_revision_bump()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_project_id uuid;
  v_page_id uuid;
begin
  if tg_table_name = 'studio_page_layers' then
    -- Language typography is a reader layer; only '*' cleanup commands make the base stale.
    if tg_op = 'INSERT' and new.language <> '*' then return null; end if;
    if tg_op = 'DELETE' and old.language <> '*' then return null; end if;
    if tg_op = 'UPDATE' and old.language <> '*' and new.language <> '*' then return null; end if;
  end if;
  if tg_table_name = 'studio_pages' then
    if tg_op = 'DELETE' then v_project_id := old.project_id;
    else v_project_id := new.project_id; end if;
  else
    if tg_op = 'DELETE' then v_page_id := old.page_id;
    else v_page_id := new.page_id; end if;
    select p.project_id into v_project_id from public.studio_pages p where p.id = v_page_id;
  end if;
  if v_project_id is not null then
    update public.studio_projects set content_revision = content_revision + 1
    where id = v_project_id;
  end if;
  return null;
end;
$function$;

create trigger studio_pages_content_revision after insert or update or delete on public.studio_pages
for each row execute function app_private.studio_content_revision_bump();
create trigger studio_regions_content_revision after insert or update or delete on public.studio_regions
for each row execute function app_private.studio_content_revision_bump();
create trigger studio_layers_content_revision after insert or update or delete on public.studio_page_layers
for each row execute function app_private.studio_content_revision_bump();

-- A reader call must not send the same source repeatedly to a paid provider.
alter table public.studio_jobs drop constraint studio_jobs_job_type_check;
alter table public.studio_jobs add constraint studio_jobs_job_type_check
  check (job_type in ('ocr', 'translate', 'reader_translate', 'inpaint', 'render'));
alter table public.studio_jobs
  add column attempt_token uuid,
  add column lease_expires_at timestamptz,
  add column finished_at timestamptz,
  add constraint studio_jobs_lease_check check (
    (status = 'running' and attempt_token is not null and lease_expires_at is not null)
    or (status <> 'running' and attempt_token is null and lease_expires_at is null)
  );

create index studio_jobs_lease_idx on public.studio_jobs (lease_expires_at)
  where status = 'running';

create table app_private.studio_ai_daily_usage (
  usage_day date not null,
  job_type text not null check (job_type = 'reader_translate'),
  claim_count integer not null check (claim_count between 0 and 200),
  primary key (usage_day, job_type)
);
alter table app_private.studio_ai_daily_usage enable row level security;
revoke all on app_private.studio_ai_daily_usage from public, anon, authenticated;

create or replace function app_private.studio_job_claim(
  p_project_id uuid, p_page_id uuid, p_job_type text, p_language text,
  p_idempotency_key text, p_input_version bigint, p_lease_seconds integer default 300
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_job record;
  v_rights_status text;
  v_page_project_id uuid;
  v_page_status text;
  v_token uuid;
  v_lease timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'İş alma yalnız sunucu işlemidir.';
  end if;
  if p_job_type is null
    or p_job_type not in ('ocr', 'translate', 'reader_translate', 'inpaint', 'render')
    or p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 1 and 200
    or p_input_version is null or p_input_version < 1
    or p_lease_seconds is null or p_lease_seconds not between 30 and 900
    or (p_language is not null and not app_private.studio_language_valid(p_language)) then
    raise sqlstate '22023' using message = 'İş bilgileri geçersiz.';
  end if;
  select p.rights_status into v_rights_status from public.studio_projects p
  where p.id = p_project_id for share;
  if not found then raise sqlstate 'PT404' using message = 'Proje bulunamadı.'; end if;
  if v_rights_status <> 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;
  if p_page_id is not null then
    select page.project_id, page.raw_status into v_page_project_id, v_page_status
    from public.studio_pages page where page.id = p_page_id;
    if not found or v_page_project_id is distinct from p_project_id or v_page_status <> 'ready' then
      raise sqlstate 'PT409' using message = 'İş için hazır proje sayfası bulunamadı.';
    end if;
  end if;

  v_token := gen_random_uuid();
  v_lease := now() + pg_catalog.make_interval(secs => p_lease_seconds);
  insert into public.studio_jobs
    (project_id, page_id, job_type, language, idempotency_key, status,
      attempts, input_version, attempt_token, lease_expires_at)
  values (p_project_id, p_page_id, p_job_type, p_language, p_idempotency_key,
    'running', 1, p_input_version, v_token, v_lease)
  on conflict (project_id, idempotency_key) do nothing
  returning * into v_job;
  if found then
    if p_job_type = 'reader_translate' then
      insert into app_private.studio_ai_daily_usage (usage_day, job_type, claim_count)
      values ((now() at time zone 'UTC')::date, 'reader_translate', 1)
      on conflict (usage_day, job_type) do update
        set claim_count = app_private.studio_ai_daily_usage.claim_count + 1
        where app_private.studio_ai_daily_usage.claim_count < 200;
      if not found then raise sqlstate 'PT429' using message = 'Günlük çeviri kotası doldu.'; end if;
    end if;
    return pg_catalog.jsonb_build_object('state', 'claimed', 'job_id', v_job.id,
      'attempt_token', v_job.attempt_token, 'lease_expires_at', v_job.lease_expires_at,
      'attempts', v_job.attempts);
  end if;

  select * into v_job from public.studio_jobs j
  where j.project_id = p_project_id and j.idempotency_key = p_idempotency_key for update;
  if v_job.page_id is distinct from p_page_id
    or v_job.job_type is distinct from p_job_type
    or v_job.language is distinct from p_language
    or v_job.input_version is distinct from p_input_version then
    raise sqlstate 'PT409' using message = 'İş anahtarı farklı bir girdiye ait.';
  end if;
  if v_job.status = 'succeeded' then
    return pg_catalog.jsonb_build_object('state', 'succeeded', 'job_id', v_job.id);
  end if;
  if v_job.status = 'running' and v_job.lease_expires_at > now() then
    return pg_catalog.jsonb_build_object('state', 'busy', 'job_id', v_job.id,
      'lease_expires_at', v_job.lease_expires_at);
  end if;
  if v_job.attempts >= 10 then
    return pg_catalog.jsonb_build_object('state', 'failed', 'job_id', v_job.id,
      'attempts', v_job.attempts);
  end if;

  v_token := gen_random_uuid();
  v_lease := now() + pg_catalog.make_interval(secs => p_lease_seconds);
  update public.studio_jobs set status = 'running', attempts = attempts + 1,
    attempt_token = v_token, lease_expires_at = v_lease,
    finished_at = null, error_code = null where id = v_job.id
  returning * into v_job;
  if p_job_type = 'reader_translate' then
    insert into app_private.studio_ai_daily_usage (usage_day, job_type, claim_count)
    values ((now() at time zone 'UTC')::date, 'reader_translate', 1)
    on conflict (usage_day, job_type) do update
      set claim_count = app_private.studio_ai_daily_usage.claim_count + 1
      where app_private.studio_ai_daily_usage.claim_count < 200;
    if not found then raise sqlstate 'PT429' using message = 'Günlük çeviri kotası doldu.'; end if;
  end if;
  return pg_catalog.jsonb_build_object('state', 'claimed', 'job_id', v_job.id,
    'attempt_token', v_job.attempt_token, 'lease_expires_at', v_job.lease_expires_at,
    'attempts', v_job.attempts);
end;
$function$;

create or replace function app_private.studio_job_complete(
  p_job_id uuid, p_attempt_token uuid, p_succeeded boolean, p_error_code text default null
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_job record;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'İş tamamlama yalnız sunucu işlemidir.';
  end if;
  if p_attempt_token is null or p_succeeded is null
    or (p_error_code is not null and pg_catalog.length(p_error_code) > 120) then
    raise sqlstate '22023' using message = 'İş sonucu geçersiz.';
  end if;
  -- Same lock order as claim: project first, then job. So revoke/retry does not deadlock.
  select p.rights_status into v_job from public.studio_projects p
  where p.id = (select j.project_id from public.studio_jobs j where j.id = p_job_id)
  for share;
  if not found then raise sqlstate 'PT404' using message = 'İş bulunamadı.'; end if;
  if v_job.rights_status <> 'active' then
    raise sqlstate 'PT403' using message = 'Yayın hakkı etkin değil.';
  end if;
  select j.* into v_job from public.studio_jobs j where j.id = p_job_id for update;
  if not found then raise sqlstate 'PT404' using message = 'İş bulunamadı.'; end if;
  if v_job.status <> 'running'
    or v_job.attempt_token is distinct from p_attempt_token
    or v_job.lease_expires_at <= now() then
    raise sqlstate 'PT409' using message = 'İş denemesi artık geçerli değil.';
  end if;
  update public.studio_jobs set status = case when p_succeeded then 'succeeded' else 'failed' end,
    attempt_token = null, lease_expires_at = null, finished_at = now(),
    error_code = case when p_succeeded then null else coalesce(p_error_code, 'unknown') end
  where id = p_job_id;
  return pg_catalog.jsonb_build_object('state', case when p_succeeded then 'succeeded' else 'failed' end,
    'job_id', p_job_id);
end;
$function$;

create or replace function public.studio_job_claim(
  p_project_id uuid, p_page_id uuid, p_job_type text, p_language text,
  p_idempotency_key text, p_input_version bigint, p_lease_seconds integer default 300
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_job_claim(p_project_id, p_page_id, p_job_type,
    p_language, p_idempotency_key, p_input_version, p_lease_seconds);
$function$;

create or replace function public.studio_job_complete(
  p_job_id uuid, p_attempt_token uuid, p_succeeded boolean, p_error_code text default null
) returns jsonb language sql security invoker set search_path = '' as $function$
  select app_private.studio_job_complete(p_job_id, p_attempt_token, p_succeeded, p_error_code);
$function$;

revoke all on function app_private.studio_job_claim(uuid, uuid, text, text, text, bigint, integer),
  app_private.studio_job_complete(uuid, uuid, boolean, text),
  public.studio_job_claim(uuid, uuid, text, text, text, bigint, integer),
  public.studio_job_complete(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function app_private.studio_job_claim(uuid, uuid, text, text, text, bigint, integer),
  app_private.studio_job_complete(uuid, uuid, boolean, text),
  public.studio_job_claim(uuid, uuid, text, text, text, bigint, integer),
  public.studio_job_complete(uuid, uuid, boolean, text) to service_role;
