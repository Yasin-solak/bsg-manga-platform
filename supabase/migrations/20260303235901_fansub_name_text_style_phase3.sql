begin;

alter table public.fansubs
  add column if not exists active_name_style jsonb;

commit;
