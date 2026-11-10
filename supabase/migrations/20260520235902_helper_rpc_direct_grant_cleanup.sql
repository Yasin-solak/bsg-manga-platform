-- Helper-only SECURITY DEFINER functions should not be direct Data API RPCs.
-- Public wrappers can still call these functions through the function owner context.

do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.chapter_public_unlock_at(timestamp with time zone)',
    'public.is_chapter_publicly_unlocked(timestamp with time zone)',
    'public.is_feature_enabled(text, boolean)'
  ]
  loop
    v_function := to_regprocedure(v_signature);

    if v_function is not null then
      execute format('revoke execute on function %s from anon, authenticated, public', v_function);
      execute format('grant execute on function %s to service_role', v_function);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
