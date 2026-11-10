-- Translation Studio V2: atomic UTC day budget for paid model calls.
-- Points are not real money amounts; an upper limit to readjust with pilot measurement.

alter table app_private.studio_ai_daily_usage
  drop constraint studio_ai_daily_usage_job_type_check;
alter table app_private.studio_ai_daily_usage
  add constraint studio_ai_daily_usage_job_type_check
  check (job_type in ('ocr', 'translate', 'reader_translate'));

create table app_private.studio_ai_daily_total_usage (
  usage_day date primary key,
  claim_count integer not null check (claim_count >= 0),
  budget_units integer not null check (budget_units >= 0)
);
alter table app_private.studio_ai_daily_total_usage enable row level security;
revoke all on app_private.studio_ai_daily_total_usage from public, anon, authenticated;

create table app_private.studio_ai_daily_project_usage (
  usage_day date not null,
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  claim_count integer not null check (claim_count >= 0),
  budget_units integer not null check (budget_units >= 0),
  primary key (usage_day, project_id)
);
alter table app_private.studio_ai_daily_project_usage enable row level security;
revoke all on app_private.studio_ai_daily_project_usage from public, anon, authenticated;

create or replace function app_private.studio_ai_daily_charge(
  p_project_id uuid, p_job_type text
) returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_day date := (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
  v_type_limit integer;
  v_units integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Model bütçesi yalnız sunucu işlemidir.';
  end if;
  if p_project_id is null then
    raise sqlstate '22023' using message = 'Proje kimliği geçersiz.';
  end if;
  case p_job_type
    when 'ocr' then v_type_limit := 80; v_units := 8;
    when 'translate' then v_type_limit := 160; v_units := 2;
    when 'reader_translate' then v_type_limit := 200; v_units := 2;
    else raise sqlstate '22023' using message = 'Model iş türü geçersiz.';
  end case;

  -- All jobs start from the same global row and take locks in the same order.
  -- If the RPC transaction errors these three increments and the job lease roll back together.
  insert into app_private.studio_ai_daily_total_usage
    (usage_day, claim_count, budget_units)
  values (v_day, 1, v_units)
  on conflict (usage_day) do update
    set claim_count = app_private.studio_ai_daily_total_usage.claim_count + 1,
      budget_units = app_private.studio_ai_daily_total_usage.budget_units + v_units
    where app_private.studio_ai_daily_total_usage.budget_units <= 1000 - v_units;
  if not found then
    raise sqlstate 'PT429' using message = 'Günlük toplam model bütçesi doldu.';
  end if;

  insert into app_private.studio_ai_daily_project_usage
    (usage_day, project_id, claim_count, budget_units)
  values (v_day, p_project_id, 1, v_units)
  on conflict (usage_day, project_id) do update
    set claim_count = app_private.studio_ai_daily_project_usage.claim_count + 1,
      budget_units = app_private.studio_ai_daily_project_usage.budget_units + v_units
    where app_private.studio_ai_daily_project_usage.budget_units <= 500 - v_units;
  if not found then
    raise sqlstate 'PT429' using message = 'Projenin günlük model bütçesi doldu.';
  end if;

  insert into app_private.studio_ai_daily_usage (usage_day, job_type, claim_count)
  values (v_day, p_job_type, 1)
  on conflict (usage_day, job_type) do update
    set claim_count = app_private.studio_ai_daily_usage.claim_count + 1
    where app_private.studio_ai_daily_usage.claim_count < v_type_limit;
  if not found then
    raise sqlstate 'PT429' using message = 'Günlük işlem türü kotası doldu.';
  end if;
end;
$function$;

revoke all on function app_private.studio_ai_daily_charge(uuid, text)
  from public, anon, authenticated;

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
    if p_job_type in ('ocr', 'translate', 'reader_translate') then
      perform app_private.studio_ai_daily_charge(p_project_id, p_job_type);
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
  if p_job_type in ('ocr', 'translate', 'reader_translate') then
    perform app_private.studio_ai_daily_charge(p_project_id, p_job_type);
  end if;
  return pg_catalog.jsonb_build_object('state', 'claimed', 'job_id', v_job.id,
    'attempt_token', v_job.attempt_token, 'lease_expires_at', v_job.lease_expires_at,
    'attempts', v_job.attempts);
end;
$function$;
