begin;

alter table public.fansubs
  add column if not exists vanity_slug_changed_at timestamptz;

comment on column public.fansubs.vanity_slug_changed_at is
  'Fansub ozel URL alaninda yapilan son gercek slug degisikliginin zamani. Ilk degisiklik serbest, sonrakiler cooldown ile korunur.';

create or replace function public.get_fansub_vanity_slug_cooldown_interval()
returns interval
language sql
immutable
set search_path = public
as $$
  select interval '30 days';
$$;

grant execute on function public.get_fansub_vanity_slug_cooldown_interval() to anon, authenticated;

create or replace function public.guard_fansub_vanity_slug_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_slug text := lower(trim(coalesce(old.slug, '')));
  v_new_slug text := lower(trim(coalesce(new.slug, '')));
  v_is_privileged boolean := auth.role() = 'service_role' or public.is_admin();
  v_cooldown interval := public.get_fansub_vanity_slug_cooldown_interval();
  v_next_change_at timestamptz;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if v_old_slug = v_new_slug then
    return new;
  end if;

  new.slug := v_new_slug;

  if not v_is_privileged then
    if not public.is_fansub_admin(new.id) then
      raise exception 'Sadece fansub yoneticisi ozel URL degistirebilir.';
    end if;

    if not public.fansub_has_boost_capability(new.id, 'hasVanityUrl') then
      raise exception 'Ozel URL icin Seviye 3 takviye gerekir.';
    end if;

    if old.vanity_slug_changed_at is not null then
      v_next_change_at := old.vanity_slug_changed_at + v_cooldown;

      if now() < v_next_change_at then
        raise exception 'Ozel URL 30 gunde bir degistirilebilir. Sonraki degisim tarihi: %',
          to_char(v_next_change_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY');
      end if;
    end if;
  end if;

  -- To protect link identity we record every real slug change.
  new.vanity_slug_changed_at := now();
  return new;
end;
$$;

commit;
