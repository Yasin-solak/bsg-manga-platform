-- Measurement infrastructure: pg_stat_statements collects query stats (call count,
-- average/total time, buffer hit rate). Goal: the next scale
-- decision rests on data, not guesses.
--
-- On Supabase the extension comes preloaded (in shared_preload_libraries);
-- this statement is a no-op there, on local/self-hosted setups it enables the extension.
-- Reading guide: docs/yavas-sorgu-okuma-rehberi-2026-07-08.md

create extension if not exists pg_stat_statements;
