begin;

update public.store_cosmetic_packages
set is_active = false
where package_key in ('pkg-shadow-rose', 'pkg-royal-gold', 'pkg-neon-orbit')
  and is_active = true;

commit;
