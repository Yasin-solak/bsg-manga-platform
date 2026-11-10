-- Metadata column for detailed fields in the fansub request form.

alter table public.fansub_requests
  add column if not exists request_meta jsonb not null default '{}'::jsonb;
