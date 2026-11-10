alter table public.store_items
    add column if not exists theme_name text;

comment on column public.store_items.theme_name is
    'Cerceve ve arkaplan urunlerinin browse tema filtresi icin kullanilan tema etiketi.';

create index if not exists store_items_theme_name_idx
    on public.store_items (lower(theme_name))
    where theme_name is not null;