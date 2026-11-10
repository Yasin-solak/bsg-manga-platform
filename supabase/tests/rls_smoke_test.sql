-- ============================================
-- BSG Manga | RLS Smoke Test
-- Date: 2026-02-07
-- ============================================
-- Bu dosya SQL Editor'de migrationlar uygulandiktan sonra calistirilir.
-- Varsayim:
-- - 005 showcase seed calismis
-- - asagidaki public user id'leri mevcut:
--   admin  : 11111111-1111-1111-1111-111111111111
--   user_a : 22222222-2222-2222-2222-222222222222
--   user_b : 33333333-3333-3333-3333-333333333333
--   user_c : 44444444-4444-4444-4444-444444444444

-- --------------------------------------------
-- 1) ANON: okuma var, yazma yok
-- --------------------------------------------
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select count(*) as anon_can_read_active_users
from public.users
where is_active = true;

do $$
begin
  begin
    insert into public.users (auth_user_id, username, username_slug)
    values (
      'aaaaaaaa-0000-0000-0000-000000000001',
      'anon_test_user',
      'anon-test-user'
    );
    raise exception '[FAIL] anon insert beklenirken basarili oldu';
  exception
    when others then
      raise notice '[PASS] anon insert engellendi: %', sqlerrm;
  end;
end;
$$;
rollback;

-- --------------------------------------------
-- 2) NORMAL USER: kendi kaydini guncelleyebilir, baskasini guncelleyemez
-- --------------------------------------------
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (select auth_user_id::text from public.users where id = '22222222-2222-2222-2222-222222222222'::uuid limit 1),
    ''
  ),
  true
);

select public.current_public_user_id() as user_ctx_public_id;

update public.users
set bio = 'RLS smoke test - self update'
where id = '22222222-2222-2222-2222-222222222222'::uuid;

do $$
begin
  begin
    update public.users
    set role = 'admin'
    where id = '33333333-3333-3333-3333-333333333333'::uuid;
    raise exception '[FAIL] normal user baskasinin rolunu degistirebildi';
  exception
    when others then
      raise notice '[PASS] normal user baskasinin rolunu degistiremedi: %', sqlerrm;
  end;
end;
$$;
rollback;

-- --------------------------------------------
-- 3) NORMAL USER: follow/unfollow RPC + own insert kurali
-- --------------------------------------------
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (select auth_user_id::text from public.users where id = '22222222-2222-2222-2222-222222222222'::uuid limit 1),
    ''
  ),
  true
);

select public.unfollow_user('33333333-3333-3333-3333-333333333333'::uuid) as rpc_cleanup;

select public.follow_user('33333333-3333-3333-3333-333333333333'::uuid) as rpc_follow_first;
select public.follow_user('33333333-3333-3333-3333-333333333333'::uuid) as rpc_follow_second;

do $$
begin
  begin
    insert into public.user_follows (follower_id, following_id)
    values (
      '33333333-3333-3333-3333-333333333333'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid
    );
    raise exception '[FAIL] normal user baskasi adina follow insert yapabildi';
  exception
    when others then
      raise notice '[PASS] normal user baskasi adina follow insert yapamadi: %', sqlerrm;
  end;
end;
$$;

do $$
begin
  begin
    perform public.follow_user('22222222-2222-2222-2222-222222222222'::uuid);
    raise exception '[FAIL] self follow engellenmedi';
  exception
    when others then
      raise notice '[PASS] self follow engellendi: %', sqlerrm;
  end;
end;
$$;

select public.unfollow_user('33333333-3333-3333-3333-333333333333'::uuid) as rpc_unfollow_first;
select public.unfollow_user('33333333-3333-3333-3333-333333333333'::uuid) as rpc_unfollow_second;

select public.unfollow_manga('70000000-0000-0000-0000-000000000001'::uuid) as rpc_manga_cleanup;
select public.follow_manga('70000000-0000-0000-0000-000000000001'::uuid) as rpc_manga_follow_first;
select public.follow_manga('70000000-0000-0000-0000-000000000001'::uuid) as rpc_manga_follow_second;
select public.unfollow_manga('70000000-0000-0000-0000-000000000001'::uuid) as rpc_manga_unfollow_first;
select public.unfollow_manga('70000000-0000-0000-0000-000000000001'::uuid) as rpc_manga_unfollow_second;

select public.unfollow_fansub('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid) as rpc_fansub_cleanup;
select public.follow_fansub('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid) as rpc_fansub_follow_first;
select public.follow_fansub('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid) as rpc_fansub_follow_second;
select public.unfollow_fansub('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid) as rpc_fansub_unfollow_first;
select public.unfollow_fansub('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid) as rpc_fansub_unfollow_second;
rollback;

-- --------------------------------------------
-- 4) ADMIN: rol guncelleme yetkisi
-- --------------------------------------------
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  coalesce(
    (select auth_user_id::text from public.users where id = '11111111-1111-1111-1111-111111111111'::uuid limit 1),
    ''
  ),
  true
);

select public.current_app_role() as admin_role;

update public.users
set role = 'moderator'
where id = '44444444-4444-4444-4444-444444444444'::uuid;

select id, role
from public.users
where id = '44444444-4444-4444-4444-444444444444'::uuid;

rollback;
