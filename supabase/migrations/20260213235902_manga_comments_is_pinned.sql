-- ============================================
-- Manga comments pin support and admin guard
-- Date: 2026-02-13
-- ============================================

begin;

alter table public.manga_comments
  add column if not exists is_pinned boolean not null default false;

create index if not exists manga_comments_pin_order_idx
  on public.manga_comments (is_pinned desc, created_at desc)
  where is_active = true;

create or replace function public.enforce_manga_comment_pin_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_pinned is distinct from old.is_pinned and not public.is_admin() then
    raise exception 'Sadece admin yorum sabitleyebilir.';
  end if;

  return new;
end;
$$;

drop trigger if exists manga_comments_pin_admin_guard on public.manga_comments;
create trigger manga_comments_pin_admin_guard
before update on public.manga_comments
for each row
execute function public.enforce_manga_comment_pin_admin();

commit;
