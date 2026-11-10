-- Enforce the community and site announcement split at DB level.
-- The "Duyuru" category can no longer be used in community_posts.

create or replace function public.prevent_duyuru_in_community_posts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category is not null and lower(btrim(new.category)) = 'duyuru' then
    raise exception 'Duyuru kategorisi topluluk icin kapatildi. Site duyurulari icin site_announcements tablosunu kullanin.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duyuru_in_community_posts on public.community_posts;
create trigger trg_prevent_duyuru_in_community_posts
  before insert or update on public.community_posts
  for each row
  execute function public.prevent_duyuru_in_community_posts();

drop policy if exists community_posts_insert_self on public.community_posts;
create policy community_posts_insert_self
  on public.community_posts
  for insert
  with check (
    author_id = public.current_public_user_id()
    and lower(coalesce(btrim(category), '')) <> 'duyuru'
  );

drop policy if exists community_posts_update_self_or_admin on public.community_posts;
create policy community_posts_update_self_or_admin
  on public.community_posts
  for update
  using (author_id = public.current_public_user_id() or public.is_admin())
  with check (
    (author_id = public.current_public_user_id() or public.is_admin())
    and lower(coalesce(btrim(category), '')) <> 'duyuru'
  );
