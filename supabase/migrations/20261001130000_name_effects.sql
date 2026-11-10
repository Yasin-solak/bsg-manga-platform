-- Name effects: an animated image placed behind / around the name (animated WebP / APNG /
-- GIF). The effect is uploaded from Shop Control; a reader picks it in the name style by "fx-<slug>" id
-- (owned_items.active_name_style.effectId). A Premium perk (like name style).
-- Built-in effect images ship with the app (/name-effects/*.webp); uploaded ones are in R2.

create table if not exists public.name_effects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  description text check (description is null or char_length(description) <= 160),
  asset_url text not null check (char_length(asset_url) between 1 and 600),
  -- Image overflow margin from the name box (percent): horizontal and vertical.
  overflow_x integer not null default 18 check (overflow_x between 0 and 120),
  overflow_y integer not null default 60 check (overflow_y between 0 and 200),
  -- Dikey kaydirma (yuzde, negatif yukari).
  offset_y integer not null default 0 check (offset_y between -100 and 100),
  blend text not null default 'normal' check (blend in ('normal', 'screen', 'lighten', 'plus-lighter')),
  layer text not null default 'back' check (layer in ('back', 'front')),
  -- Yazinin efektle uyumlu parlamasi (bos: okurun isim rengi aynen).
  text_glow text check (text_glow is null or text_glow ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_weight integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.name_effects enable row level security;
revoke all on public.name_effects from anon, authenticated;

-- Public list: only published ones (names on all pages draw with this list).
create or replace function public.name_effects_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', e.slug, 'name', e.name, 'description', e.description, 'assetUrl', e.asset_url,
    'overflowX', e.overflow_x, 'overflowY', e.overflow_y, 'offsetY', e.offset_y,
    'blend', e.blend, 'layer', e.layer, 'textGlow', e.text_glow
  ) order by e.sort_weight desc, e.created_at), '[]'::jsonb)
  from public.name_effects e
  where e.status = 'published';
$$;

create or replace function public.name_effects_admin_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'name', e.name, 'description', e.description, 'assetUrl', e.asset_url,
      'overflowX', e.overflow_x, 'overflowY', e.overflow_y, 'offsetY', e.offset_y,
      'blend', e.blend, 'layer', e.layer, 'textGlow', e.text_glow,
      'status', e.status, 'sortWeight', e.sort_weight, 'updatedAt', e.updated_at
    ) order by case e.status when 'published' then 0 when 'draft' then 1 else 2 end, e.sort_weight desc, e.created_at)
    from public.name_effects e
  ), '[]'::jsonb);
end;
$$;

create or replace function public.name_effects_admin_save(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_slug text;
begin
  if not app_private.is_admin() then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Efekt adi 1-40 karakter olmali.';
  end if;
  if nullif(btrim(coalesce(p ->> 'assetUrl', '')), '') is null then
    raise exception 'Efekt gorseli gerekli.';
  end if;

  if v_id is null then
    v_slug := left(regexp_replace(regexp_replace(lower(coalesce(nullif(p ->> 'slug', ''), v_name)), '[^a-z0-9-]+', '-', 'g'), '(^-+|-+$)', '', 'g'), 34);
    if char_length(v_slug) < 2 then v_slug := 'efekt'; end if;
    if exists (select 1 from public.name_effects e where e.slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
    end if;
    insert into public.name_effects (slug, name, description, asset_url, overflow_x, overflow_y, offset_y, blend, layer, text_glow, status, sort_weight, created_by)
    values (
      v_slug, v_name, nullif(btrim(coalesce(p ->> 'description', '')), ''), btrim(p ->> 'assetUrl'),
      coalesce((p ->> 'overflowX')::integer, 18), coalesce((p ->> 'overflowY')::integer, 60), coalesce((p ->> 'offsetY')::integer, 0),
      coalesce(nullif(p ->> 'blend', ''), 'normal'), coalesce(nullif(p ->> 'layer', ''), 'back'), nullif(p ->> 'textGlow', ''),
      coalesce(nullif(p ->> 'status', ''), 'draft'), coalesce((p ->> 'sortWeight')::integer, 0), public.current_public_user_id()
    )
    returning id into v_id;
  else
    update public.name_effects set
      name = v_name,
      description = nullif(btrim(coalesce(p ->> 'description', '')), ''),
      asset_url = btrim(p ->> 'assetUrl'),
      overflow_x = coalesce((p ->> 'overflowX')::integer, overflow_x),
      overflow_y = coalesce((p ->> 'overflowY')::integer, overflow_y),
      offset_y = coalesce((p ->> 'offsetY')::integer, offset_y),
      blend = coalesce(nullif(p ->> 'blend', ''), blend),
      layer = coalesce(nullif(p ->> 'layer', ''), layer),
      text_glow = nullif(p ->> 'textGlow', ''),
      status = coalesce(nullif(p ->> 'status', ''), status),
      sort_weight = coalesce((p ->> 'sortWeight')::integer, sort_weight),
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'Efekt bulunamadi.';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.name_effects_list() from public;
revoke all on function public.name_effects_admin_list() from public;
revoke all on function public.name_effects_admin_save(jsonb) from public;
grant execute on function public.name_effects_list() to anon, authenticated;
grant execute on function public.name_effects_admin_list() to authenticated;
grant execute on function public.name_effects_admin_save(jsonb) to authenticated;

-- Built-in effects (images ship with the app: public/name-effects). Flame is the animation the user provided;
-- the others were generated. Editable / archivable from Shop Control.
insert into public.name_effects (slug, name, description, asset_url, overflow_x, overflow_y, offset_y, blend, layer, text_glow, status, sort_weight)
values
  ('alev', 'Alev', 'Adını saran canlı alevler.', '/name-effects/alev.webp', 26, 110, -6, 'normal', 'back', '#f97316', 'published', 60),
  ('simsek', 'Şimşek', 'Adının çevresinde çatırdayan elektrik arkları.', '/name-effects/simsek.webp', 18, 90, 0, 'screen', 'back', '#38bdf8', 'published', 50),
  ('buz', 'Buz', 'Kristal buz kırıkları ve soğuk sis.', '/name-effects/buz.webp', 18, 90, 0, 'normal', 'back', '#bae6fd', 'published', 40),
  ('sakura', 'Sakura', 'Adının etrafında dönen kiraz çiçeği yaprakları.', '/name-effects/sakura.webp', 18, 90, 0, 'normal', 'back', null, 'published', 30),
  ('yildiz', 'Yıldız', 'Nebula parıltısı ve yanıp sönen yıldızlar.', '/name-effects/yildiz.webp', 18, 90, 0, 'screen', 'back', '#c4b5fd', 'published', 20),
  ('duman', 'Gölge', 'Adının altından yükselen mor duman.', '/name-effects/duman.webp', 18, 90, 0, 'normal', 'back', '#a78bfa', 'published', 10)
on conflict (slug) do nothing;
