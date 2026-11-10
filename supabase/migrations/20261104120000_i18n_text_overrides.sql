-- English for admin-written texts.
--
-- A source text -> English mapping sits in one table; source tables and the RPCs
-- returning them do not change. The client puts this table over the dictionary on /en open.
-- The table is public: only PUBLICLY published texts can be saved
-- (a draft, private-audience announcement or off-sale product cannot go here).

create table public.i18n_text_overrides (
  source_text text primary key check (char_length(source_text) between 1 and 8000),
  en_text text not null check (char_length(btrim(en_text)) between 1 and 8000),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.i18n_text_overrides enable row level security;
create policy i18n_text_overrides_public_read on public.i18n_text_overrides for select to anon, authenticated using (true);
revoke all on public.i18n_text_overrides from anon, authenticated;
grant select (source_text, en_text) on public.i18n_text_overrides to anon, authenticated;

create function public.i18n_public_source_rows()
returns table (source_table text, field text, source_text text)
language sql
stable
security definer
set search_path = ''
as $$
  with rows(source_table, field, source_text) as (
    select 'announcement', 'title', e.title from announcement_internal.entries e where e.status = 'published' and e.audience = 'all' and e.starts_at <= now()
    union all
    select 'announcement', 'text', b.value ->> 'text'
      from announcement_internal.entries e, jsonb_array_elements(e.document) b
      where e.status = 'published' and e.audience = 'all' and e.starts_at <= now() and b.value ->> 'type' = 'text'
    union all
    select 'announcement', 'action', e.action ->> 'label' from announcement_internal.entries e where e.status = 'published' and e.audience = 'all' and e.starts_at <= now()
    union all select 'shop_product', 'title', p.title from public.shop_products p where p.status = 'published' and not (p.hide_until_launch and coalesce(p.available_from, now()) > now())
    union all select 'shop_product', 'subtitle', p.subtitle from public.shop_products p where p.status = 'published' and not (p.hide_until_launch and coalesce(p.available_from, now()) > now())
    union all select 'shop_product', 'description', p.description from public.shop_products p where p.status = 'published' and not (p.hide_until_launch and coalesce(p.available_from, now()) > now())
    union all select 'shop_season', 'name', s.name from public.shop_seasons s where s.status = 'published'
    union all select 'shop_season', 'description', s.description from public.shop_seasons s where s.status = 'published'
    union all select 'name_effect', 'name', n.name from public.name_effects n where n.status = 'published'
    union all select 'name_effect', 'description', n.description from public.name_effects n where n.status = 'published'
    union all select 'murek_item', 'name', m.name from public.murek_items m where m.is_active
    union all select 'murek_item', 'description', m.description from public.murek_items m where m.is_active
    union all select 'site_event', 'name', v.name from public.site_events v where v.status <> 'draft' and v.starts_at <= now()
    union all select 'site_event', 'summary', v.summary from public.site_events v where v.status <> 'draft' and v.starts_at <= now()
    union all select 'quest_event', 'title', q.title from public.quest_events q where q.is_active
    union all select 'quest_event', 'description', q.description from public.quest_events q where q.is_active
    union all select 'quest', 'title', q.title from public.quests q where q.is_active
    union all select 'quest', 'description', q.description from public.quests q where q.is_active
  )
  select distinct r.source_table, r.field, btrim(r.source_text)
  from rows r
  where r.source_text is not null and btrim(r.source_text) <> ''
$$;
revoke all on function public.i18n_public_source_rows() from public, anon, authenticated;

create function public.admin_i18n_source_texts()
returns table (source_table text, field text, source_text text, en_text text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin tarafindan calistirilabilir.';
  end if;
  return query
    select r.source_table, r.field, r.source_text, o.en_text, o.updated_at
    from public.i18n_public_source_rows() r
    left join public.i18n_text_overrides o on o.source_text = r.source_text
    order by r.source_table, r.field, r.source_text;
end
$$;
revoke all on function public.admin_i18n_source_texts() from public, anon;
grant execute on function public.admin_i18n_source_texts() to authenticated;

create function public.admin_i18n_save_text(p_source_text text, p_en_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_en text := btrim(coalesce(p_en_text, ''));
begin
  if not public.is_admin() then
    raise exception 'Bu islem sadece admin tarafindan calistirilabilir.';
  end if;
  if char_length(v_en) > 8000 then
    raise exception 'Metin en fazla 8000 karakter olabilir.';
  end if;
  if v_en = '' then
    delete from public.i18n_text_overrides where source_text = p_source_text;
  else
    -- A public table: only published public text is saved.
    if not exists (select 1 from public.i18n_public_source_rows() r where r.source_text = p_source_text) then
      raise exception 'Bu metin yayinda degil ya da herkese acik degil.';
    end if;
    insert into public.i18n_text_overrides (source_text, en_text, updated_by)
    values (p_source_text, v_en, public.current_public_user_id())
    on conflict (source_text) do update
      set en_text = excluded.en_text, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public.create_admin_audit_log(
    'i18n.text_override_saved',
    'i18n_text_override',
    null,
    left(p_source_text, 200),
    jsonb_build_object('cleared', v_en = '')
  );
end
$$;
revoke all on function public.admin_i18n_save_text(text, text) from public, anon;
grant execute on function public.admin_i18n_save_text(text, text) to authenticated;

notify pgrst, 'reload schema';
