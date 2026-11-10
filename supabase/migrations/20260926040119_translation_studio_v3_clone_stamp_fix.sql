-- Translation Studio V3: clone stamp validator fix. In the earlier version
-- `v_stroke->'offset' - 'x'` grouped wrong (operator precedence); parenthesized.

create or replace function app_private.tl_strokes_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare
  v_stroke jsonb;
  v_point jsonb;
begin
  if p is null or pg_catalog.jsonb_typeof(p) <> 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p) > 2000 or pg_catalog.octet_length(p::text) > 2097152 then
    return false;
  end if;
  for v_stroke in select value from pg_catalog.jsonb_array_elements(p) loop
    if pg_catalog.jsonb_typeof(v_stroke) <> 'object'
      or v_stroke - 'tool' - 'color' - 'radius' - 'points' - 'offset' <> '{}'::jsonb
      or coalesce(v_stroke->>'tool', '') not in ('firca', 'onarim', 'silgi', 'damga')
      or pg_catalog.jsonb_typeof(v_stroke->'radius') is distinct from 'number'
      or (v_stroke->>'radius')::numeric not between 1 and 200
      or (v_stroke ? 'color' and coalesce(v_stroke->>'color', '') !~ '^#[0-9a-fA-F]{6}$')
      or pg_catalog.jsonb_typeof(v_stroke->'points') is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_stroke->'points') not between 1 and 4096 then
      return false;
    end if;
    -- Damga kaynak uzakligi zorunlu; diger izlerde bulunmaz.
    if (v_stroke->>'tool' = 'damga') <> (v_stroke ? 'offset') then return false; end if;
    if v_stroke ? 'offset' then
      if pg_catalog.jsonb_typeof(v_stroke->'offset') is distinct from 'object'
        or pg_catalog.jsonb_typeof((v_stroke->'offset')->'x') is distinct from 'number'
        or pg_catalog.jsonb_typeof((v_stroke->'offset')->'y') is distinct from 'number'
        or ((v_stroke->'offset') - 'x'::text - 'y'::text) <> '{}'::jsonb then
        return false;
      end if;
    end if;
    for v_point in select value from pg_catalog.jsonb_array_elements(v_stroke->'points') loop
      if pg_catalog.jsonb_typeof(v_point->'x') is distinct from 'number'
        or pg_catalog.jsonb_typeof(v_point->'y') is distinct from 'number' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$function$;
