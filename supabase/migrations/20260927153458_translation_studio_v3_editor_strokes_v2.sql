-- Translation Studio V3 editor P0: cleanup strokes extended.
-- - brush/restore/stamp: opacity (0.01-1), hardness (0-1); p on points (pen pressure 0-1)
-- - restore: paints the original page back (fixes wrong auto cleanup)
-- - selection: action on the selected area (fill / repair = content aware / restore);
-- shape box (2 corners), lasso (>=3 points) or wand (1 seed + tolerance)
create or replace function app_private.tl_strokes_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare
  v_stroke jsonb;
  v_point jsonb;
  v_tool text;
  v_count integer;
begin
  if p is null or pg_catalog.jsonb_typeof(p) <> 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p) > 2000 or pg_catalog.octet_length(p::text) > 2097152 then
    return false;
  end if;
  for v_stroke in select value from pg_catalog.jsonb_array_elements(p) loop
    if pg_catalog.jsonb_typeof(v_stroke) <> 'object' then return false; end if;
    v_tool := coalesce(v_stroke->>'tool', '');
    if (v_stroke - 'tool' - 'color' - 'radius' - 'points' - 'offset' - 'opacity' - 'hardness'
          - 'mode' - 'shape' - 'tolerance') <> '{}'::jsonb
      or v_tool not in ('firca', 'onarim', 'silgi', 'damga', 'geri', 'secim')
      or pg_catalog.jsonb_typeof(v_stroke->'radius') is distinct from 'number'
      or (v_stroke->>'radius')::numeric not between 1 and 200
      or (v_stroke ? 'color' and coalesce(v_stroke->>'color', '') !~ '^#[0-9a-fA-F]{6}$')
      or pg_catalog.jsonb_typeof(v_stroke->'points') is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_stroke->'points') not between 1 and 4096 then
      return false;
    end if;
    if v_stroke ? 'opacity' and (pg_catalog.jsonb_typeof(v_stroke->'opacity') is distinct from 'number'
      or (v_stroke->>'opacity')::numeric not between 0.01 and 1) then return false; end if;
    if v_stroke ? 'hardness' and (pg_catalog.jsonb_typeof(v_stroke->'hardness') is distinct from 'number'
      or (v_stroke->>'hardness')::numeric not between 0 and 1) then return false; end if;
    -- Damga kaynak uzakligi zorunlu; diger izlerde bulunmaz.
    if (v_tool = 'damga') <> (v_stroke ? 'offset') then return false; end if;
    if v_stroke ? 'offset' then
      if pg_catalog.jsonb_typeof(v_stroke->'offset') is distinct from 'object'
        or pg_catalog.jsonb_typeof((v_stroke->'offset')->'x') is distinct from 'number'
        or pg_catalog.jsonb_typeof((v_stroke->'offset')->'y') is distinct from 'number'
        or ((v_stroke->'offset') - 'x'::text - 'y'::text) <> '{}'::jsonb then
        return false;
      end if;
    end if;
    -- Selection action: mode and shape required, present only on selection; tolerance required on wand.
    if (v_tool = 'secim') <> (v_stroke ? 'mode') or (v_tool = 'secim') <> (v_stroke ? 'shape') then return false; end if;
    if v_tool = 'secim' then
      v_count := pg_catalog.jsonb_array_length(v_stroke->'points');
      if coalesce(v_stroke->>'mode', '') not in ('doldur', 'onar', 'geri')
        or coalesce(v_stroke->>'shape', '') not in ('kutu', 'kement', 'degnek')
        or (v_stroke->>'shape' = 'kutu' and v_count <> 2)
        or (v_stroke->>'shape' = 'kement' and v_count < 3)
        or (v_stroke->>'shape' = 'degnek' and v_count <> 1)
        or (v_stroke->>'shape' = 'degnek') <> (v_stroke ? 'tolerance')
        or (v_stroke ? 'tolerance' and (pg_catalog.jsonb_typeof(v_stroke->'tolerance') is distinct from 'number'
          or (v_stroke->>'tolerance')::numeric not between 0 and 255))
        or (v_stroke->>'mode' = 'doldur') <> (v_stroke ? 'color') then
        return false;
      end if;
    elsif v_stroke ? 'tolerance' then
      return false;
    end if;
    for v_point in select value from pg_catalog.jsonb_array_elements(v_stroke->'points') loop
      if pg_catalog.jsonb_typeof(v_point) is distinct from 'object'
        or pg_catalog.jsonb_typeof(v_point->'x') is distinct from 'number'
        or pg_catalog.jsonb_typeof(v_point->'y') is distinct from 'number'
        or (v_point ? 'p' and (pg_catalog.jsonb_typeof(v_point->'p') is distinct from 'number'
          or (v_point->>'p')::numeric not between 0 and 1))
        or (v_point - 'x' - 'y' - 'p') <> '{}'::jsonb then return false; end if;
    end loop;
  end loop;
  return true;
end;
$function$;
