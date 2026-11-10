-- ============================================
-- BSG Manga | User Manga List Update RPC
-- Date: 2026-02-21
-- ============================================

begin;

create or replace function public.update_user_manga_list(
  p_list_id uuid,
  p_title text,
  p_description text default '',
  p_is_public boolean default true,
  p_manga_ids uuid[] default '{}'::uuid[],
  p_item_notes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_owner_id uuid;
  v_title text;
  v_description text;
  v_unique_ids uuid[] := '{}'::uuid[];
  v_manga_id uuid;
  v_position integer := 1;
  v_note text;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_list_id is null then
    raise exception 'Liste kimligi zorunludur.';
  end if;

  select uml.owner_id
  into v_owner_id
  from public.user_manga_lists uml
  where uml.id = p_list_id
  for update;

  if v_owner_id is null then
    raise exception 'Liste bulunamadi.';
  end if;

  if v_owner_id <> v_actor_id and not public.is_admin() then
    raise exception 'Bu listeyi duzenleme yetkiniz yok.';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) < 3 or char_length(v_title) > 80 then
    raise exception 'Liste basligi 3-80 karakter arasinda olmalidir.';
  end if;

  v_description := left(coalesce(p_description, ''), 1200);

  foreach v_manga_id in array coalesce(p_manga_ids, '{}'::uuid[]) loop
    if v_manga_id is null then
      continue;
    end if;
    if array_position(v_unique_ids, v_manga_id) is null then
      v_unique_ids := array_append(v_unique_ids, v_manga_id);
    end if;
  end loop;

  if coalesce(array_length(v_unique_ids, 1), 0) = 0 then
    raise exception 'Liste en az bir manga icermelidir.';
  end if;

  update public.user_manga_lists
  set
    title = v_title,
    description = v_description,
    is_public = coalesce(p_is_public, true),
    updated_at = now()
  where id = p_list_id;

  delete from public.user_manga_list_items
  where list_id = p_list_id;

  foreach v_manga_id in array v_unique_ids loop
    if exists (
      select 1
      from public.mangas m
      where m.id = v_manga_id
        and m.is_active = true
        and m.is_approved = true
    ) then
      v_note := left(btrim(coalesce(p_item_notes ->> v_manga_id::text, '')), 300);

      insert into public.user_manga_list_items (
        list_id,
        manga_id,
        position,
        note
      )
      values (
        p_list_id,
        v_manga_id,
        v_position,
        nullif(v_note, '')
      );

      v_position := v_position + 1;
    end if;
  end loop;

  if v_position = 1 then
    raise exception 'Listeye eklenecek gecerli manga bulunamadi.';
  end if;

  perform public.refresh_user_manga_list_stats(p_list_id);
  return p_list_id;
end;
$$;

revoke all on function public.update_user_manga_list(uuid, text, text, boolean, uuid[], jsonb) from public;
grant execute on function public.update_user_manga_list(uuid, text, text, boolean, uuid[], jsonb) to authenticated;

commit;
