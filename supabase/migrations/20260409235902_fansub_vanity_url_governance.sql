begin;

create or replace function public.assert_fansub_identifier_rules(
  p_name text,
  p_slug text
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if char_length(v_name) < 3 then
    raise exception 'Fansub adi en az 3 karakter olmali.';
  end if;

  if char_length(v_name) > 32 then
    raise exception 'Fansub adi en fazla 32 karakter olabilir.';
  end if;

  if char_length(v_slug) < 3 then
    raise exception 'Fansub slug en az 3 karakter olmali.';
  end if;

  if char_length(v_slug) > 40 then
    raise exception 'Fansub slug en fazla 40 karakter olabilir.';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Fansub slug yalnizca kucuk harf, rakam ve tire icerebilir.';
  end if;

  if v_slug = any (array['yonet', 'manga', 'bolum', 'ekle', 'tier']) then
    raise exception 'Bu fansub slug ayrilmis bir rota tarafindan kullaniliyor.';
  end if;
end;
$$;

grant execute on function public.assert_fansub_identifier_rules(text, text) to anon, authenticated;

create or replace function public.guard_fansub_vanity_slug_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_slug text := lower(trim(coalesce(old.slug, '')));
  v_new_slug text := lower(trim(coalesce(new.slug, '')));
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if v_old_slug = v_new_slug then
    return new;
  end if;

  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if not public.is_fansub_admin(new.id) then
    raise exception 'Sadece fansub yoneticisi ozel URL degistirebilir.';
  end if;

  if not public.fansub_has_boost_capability(new.id, 'hasVanityUrl') then
    raise exception 'Ozel URL icin Seviye 3 takviye gerekir.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fansub_vanity_slug_change on public.fansubs;
create trigger trg_fansub_vanity_slug_change
  before update of slug on public.fansubs
  for each row
  execute function public.guard_fansub_vanity_slug_change();

commit;
