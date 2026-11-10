-- Index optimizations for Explore page filter/sort queries.
-- Goal: speed up listMangas under search + status + new filters.

create extension if not exists pg_trgm;

create index if not exists mangas_explore_search_trgm_idx
  on public.mangas using gin (title gin_trgm_ops)
  where is_active = true and is_approved = true;

create index if not exists mangas_explore_status_updated_idx
  on public.mangas (status, updated_at desc)
  where is_active = true and is_approved = true;

create index if not exists mangas_explore_new_updated_idx
  on public.mangas (is_new, updated_at desc)
  where is_active = true and is_approved = true;

create index if not exists mangas_explore_title_idx
  on public.mangas (title)
  where is_active = true and is_approved = true;

create index if not exists mangas_explore_genres_gin_partial_idx
  on public.mangas using gin (genres)
  where is_active = true and is_approved = true;
