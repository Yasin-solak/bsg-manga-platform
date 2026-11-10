-- Fansub studio "Series": a correction request for a published series. The live row
-- does not change; the request lands in the existing revision system (pending_content_revisions) and
-- applies with apply_content_revision when site admins approve. Beyond
-- tl_submit_manga_revision in the translation studio it carries status / author / artist
-- fields and the team reason note (meta.note).
create or replace function public.submit_fansub_manga_revision(
  p_fansub_id uuid,
  p_manga_id uuid,
  p_changes jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := app_private.current_public_user_id();
  v_manga public.mangas%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_revision uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_actor is null then
    raise exception 'Kullanıcı oturumu bulunamadı.' using errcode = '42501';
  end if;
  if not (app_private.is_admin() or app_private.fansub_staff_perm(p_fansub_id, v_actor, 'panel.mangalar')) then
    raise exception 'Seri düzeltmesi göndermek için izin gerekir.' using errcode = '42501';
  end if;
  select * into v_manga from public.mangas where id = p_manga_id;
  if not found or v_manga.fansub_id is distinct from p_fansub_id then
    raise exception 'Bu seri ekibine ait değil.' using errcode = '42501';
  end if;
  if not coalesce(v_manga.is_approved, false) then
    raise exception 'Seri henüz onay bekliyor; onaydan sonra düzeltme gönderilebilir.' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'object'
    or p_changes - 'title' - 'description' - 'genres' - 'cover_image_url' - 'is_mature'
      - 'status' - 'author' - 'artist' <> '{}'::jsonb then
    raise exception 'Değişiklik alanları geçersiz.' using errcode = '22023';
  end if;
  if p_changes ? 'title' and (jsonb_typeof(p_changes->'title') <> 'string'
    or length(btrim(p_changes->>'title')) not between 1 and 200) then
    raise exception 'Seri adı 1-200 karakter olmalı.' using errcode = '22023';
  end if;
  if p_changes ? 'description' and (jsonb_typeof(p_changes->'description') <> 'string'
    or length(p_changes->>'description') > 5000) then
    raise exception 'Açıklama en fazla 5000 karakter olabilir.' using errcode = '22023';
  end if;
  if p_changes ? 'genres' and (jsonb_typeof(p_changes->'genres') <> 'array'
    or jsonb_array_length(p_changes->'genres') > 12
    or exists (select 1 from jsonb_array_elements(p_changes->'genres') g
      where jsonb_typeof(g) <> 'string' or length(g #>> '{}') not between 1 and 40)) then
    raise exception 'Türler geçersiz.' using errcode = '22023';
  end if;
  if p_changes ? 'cover_image_url' and (jsonb_typeof(p_changes->'cover_image_url') <> 'string'
    or length(p_changes->>'cover_image_url') not between 1 and 1000) then
    raise exception 'Kapak adresi geçersiz.' using errcode = '22023';
  end if;
  if p_changes ? 'is_mature' and jsonb_typeof(p_changes->'is_mature') <> 'boolean' then
    raise exception '+18 alanı geçersiz.' using errcode = '22023';
  end if;
  if p_changes ? 'status' and coalesce(p_changes->>'status', '') not in ('ongoing', 'completed', 'hiatus') then
    raise exception 'Yayın durumu geçersiz.' using errcode = '22023';
  end if;
  if (p_changes ? 'author' and (jsonb_typeof(p_changes->'author') <> 'string' or length(p_changes->>'author') > 120))
    or (p_changes ? 'artist' and (jsonb_typeof(p_changes->'artist') <> 'string' or length(p_changes->>'artist') > 120)) then
    raise exception 'Yazar / çizer en fazla 120 karakter olabilir.' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir.' using errcode = '22023';
  end if;

  v_before := app_private.content_revision_snapshot('manga', p_manga_id);
  v_after := v_before || p_changes;
  if v_after = v_before then
    raise exception 'Değişiklik yok.' using errcode = '22023';
  end if;

  -- A new one replaces an old pending request for the same series (not deleted, counted as rejected).
  update public.pending_content_revisions
  set status = 'rejected', reviewed_at = now(), updated_at = now(), review_note = 'Yerine yeni düzeltme gönderildi.'
  where target_type = 'manga' and target_id = p_manga_id and change_action = 'edit' and status = 'pending';

  insert into public.pending_content_revisions (
    target_type, target_id, fansub_id, requested_by, change_action, before_data, after_data, status, meta
  ) values (
    'manga', p_manga_id, p_fansub_id, v_actor, 'edit', v_before, v_after, 'pending',
    jsonb_build_object('source', 'fansub_panel', 'note', v_note)
  ) returning id into v_revision;
  return v_revision;
end;
$function$;

revoke all on function public.submit_fansub_manga_revision(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.submit_fansub_manga_revision(uuid, uuid, jsonb, text) to authenticated;
