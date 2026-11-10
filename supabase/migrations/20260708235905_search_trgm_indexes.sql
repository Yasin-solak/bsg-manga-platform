-- Global search (globalSearchService.searchGlobalEntities) uses leading-wildcard ilike;
-- btree indexes cannot serve this pattern so queries fell to a sequential
-- scan. With pg_trgm GIN indexes existing ilike queries run index
-- compatible; no move to an RPC is needed.
--
-- Note: a trgm index with the same predicate already exists for mangas.title
-- (20260207_019_explore_query_indexes.sql -> mangas_explore_search_trgm_idx),
-- so it is not repeated here.

create extension if not exists pg_trgm;

-- mangas: global search always filters is_active + is_approved;
-- a partial index both matches the query shape and keeps write cost low
-- (same pattern as the explore indexes in 019).
create index if not exists mangas_global_search_author_trgm_idx
  on public.mangas using gin (author gin_trgm_ops)
  where is_active = true and is_approved = true;

create index if not exists mangas_global_search_artist_trgm_idx
  on public.mangas using gin (artist gin_trgm_ops)
  where is_active = true and is_approved = true;

create index if not exists mangas_global_search_slug_trgm_idx
  on public.mangas using gin (slug gin_trgm_ops)
  where is_active = true and is_approved = true;

-- fansubs: global arama is_active = true filtreliyor (soft-delete disi kayitlar).
create index if not exists fansubs_global_search_name_trgm_idx
  on public.fansubs using gin (name gin_trgm_ops)
  where is_active = true;

create index if not exists fansubs_global_search_slug_trgm_idx
  on public.fansubs using gin (slug gin_trgm_ops)
  where is_active = true;

-- users: search comes through the public_user_directory view; the view predicate
-- uses coalesce so a partial index match would be fragile, a plain index
-- covers all calling surfaces (directory, mention search).
create index if not exists users_username_trgm_idx
  on public.users using gin (username gin_trgm_ops);
