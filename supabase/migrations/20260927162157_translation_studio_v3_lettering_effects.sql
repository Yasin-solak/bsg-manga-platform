-- Text effects: gradient color, shadow/glow and arc keys are added.
-- Measures are stored as a percent of text size.
create or replace function app_private.tl_style_valid(p_style jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
begin
  if p_style is null or pg_catalog.jsonb_typeof(p_style) <> 'object' then return false; end if;
  if p_style - 'font' - 'size' - 'lineHeight' - 'letterSpacing' - 'align'
    - 'color' - 'stroke' - 'strokeColor' - 'strokeWidth' - 'italic'
    - 'color2' - 'shadow' - 'shadowColor' - 'shadowBlur' - 'shadowX' - 'shadowY' - 'bend' <> '{}'::jsonb then
    return false;
  end if;
  if p_style ? 'font' and (pg_catalog.jsonb_typeof(p_style->'font') <> 'string'
    or pg_catalog.length(p_style->>'font') not between 1 and 64) then return false; end if;
  if p_style ? 'size' and (pg_catalog.jsonb_typeof(p_style->'size') <> 'number'
    or (p_style->>'size')::numeric not between 4 and 400) then return false; end if;
  if p_style ? 'lineHeight' and (pg_catalog.jsonb_typeof(p_style->'lineHeight') <> 'number'
    or (p_style->>'lineHeight')::numeric not between 0.5 and 3) then return false; end if;
  if p_style ? 'letterSpacing' and (pg_catalog.jsonb_typeof(p_style->'letterSpacing') <> 'number'
    or (p_style->>'letterSpacing')::numeric not between -20 and 50) then return false; end if;
  if p_style ? 'align' and coalesce(p_style->>'align', '') not in ('left', 'center', 'right') then
    return false;
  end if;
  if p_style ? 'color' and coalesce(p_style->>'color', '') !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  if p_style ? 'color2' and coalesce(p_style->>'color2', '') !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  if p_style ? 'strokeColor' and coalesce(p_style->>'strokeColor', '') !~ '^#[0-9a-fA-F]{6}$' then
    return false;
  end if;
  if p_style ? 'shadowColor' and coalesce(p_style->>'shadowColor', '') !~ '^#[0-9a-fA-F]{6}$' then
    return false;
  end if;
  if p_style ? 'strokeWidth' and (pg_catalog.jsonb_typeof(p_style->'strokeWidth') <> 'number'
    or (p_style->>'strokeWidth')::numeric not between 0 and 40) then return false; end if;
  if p_style ? 'shadowBlur' and (pg_catalog.jsonb_typeof(p_style->'shadowBlur') <> 'number'
    or (p_style->>'shadowBlur')::numeric not between 0 and 100) then return false; end if;
  if p_style ? 'shadowX' and (pg_catalog.jsonb_typeof(p_style->'shadowX') <> 'number'
    or (p_style->>'shadowX')::numeric not between -100 and 100) then return false; end if;
  if p_style ? 'shadowY' and (pg_catalog.jsonb_typeof(p_style->'shadowY') <> 'number'
    or (p_style->>'shadowY')::numeric not between -100 and 100) then return false; end if;
  if p_style ? 'bend' and (pg_catalog.jsonb_typeof(p_style->'bend') <> 'number'
    or (p_style->>'bend')::numeric not between -100 and 100) then return false; end if;
  if p_style ? 'stroke' and pg_catalog.jsonb_typeof(p_style->'stroke') <> 'boolean' then return false; end if;
  if p_style ? 'shadow' and pg_catalog.jsonb_typeof(p_style->'shadow') <> 'boolean' then return false; end if;
  if p_style ? 'italic' and pg_catalog.jsonb_typeof(p_style->'italic') <> 'boolean' then return false; end if;
  return true;
end;
$function$;
