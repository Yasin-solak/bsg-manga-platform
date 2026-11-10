-- GREATEST is an SQL construct, not a function in the pg_catalog schema; new role
-- creation raised an error. Only this expression is fixed.
do $fix$
declare
  v_def text := pg_get_functiondef('public.manage_fansub_roles(uuid, text, jsonb)'::regprocedure);
  v_new text := replace(v_def, 'pg_catalog.greatest(100, v_rank + 1)', 'greatest(100, v_rank + 1)');
begin
  if v_new = v_def then raise exception 'duzeltilecek ifade bulunamadi'; end if;
  execute v_new;
end
$fix$;
