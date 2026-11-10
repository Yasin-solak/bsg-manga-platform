-- Repo / database parity: this migration was applied to the live project in a cloud session but
-- was not added to the repo. Adds color and accessory names to the Murek look (colorName, accessoryName);
-- murek_look(uuid) signature and permission do not change. Recorded in the live database as version 20261005122922.

create or replace function app_private.murek_look(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'color', coalesce(c.id, 'mor'),
    'colorHex', coalesce(c.data ->> 'hex', '#7c6cff'),
    'colorName', c.name,
    'animated', c.data ->> 'animated',
    'accessory', a.id,
    'accessoryName', a.name
  )
  from (select 1) one
  left join public.user_murek um on um.user_id = p_user_id
  left join public.murek_items c on c.id = um.color and c.kind = 'color'
  left join public.murek_items a on a.id = um.accessory and a.kind = 'accessory'
$$;

revoke all on function app_private.murek_look(uuid) from public;
