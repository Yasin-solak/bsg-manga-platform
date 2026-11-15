-- The client subscribed to postgres_changes on auth_session_events only to react
-- to a new session a little faster. That subscription kept Realtime polling the
-- WAL (most of this database's busy time) and held a Realtime connection open
-- for every signed-in tab. The client already re-checks the session every
-- minute and whenever the tab regains focus or visibility, so the table no
-- longer needs to be published.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'auth_session_events'
  ) then
    alter publication supabase_realtime drop table public.auth_session_events;
  end if;
end;
$$;
