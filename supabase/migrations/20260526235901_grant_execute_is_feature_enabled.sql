-- Grant execute permissions back to anon and authenticated roles for is_feature_enabled.
-- Because RLS policies and database triggers running under user context (anon/authenticated) 
-- need to execute this function to check feature flags during inserts/updates.

grant execute on function public.is_feature_enabled(text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
