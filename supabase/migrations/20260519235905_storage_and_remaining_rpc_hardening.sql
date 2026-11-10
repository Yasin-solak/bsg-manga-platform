-- Storage fallback and remaining internal RPC surface hardening.
-- Even with Cloudflare/R2 as the main path the Supabase Storage fallback must keep the same permission model.

begin;

-- Kalan uc yardimci dogrudan client RPC endpointi degildir.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any(array[
        'current_auth_session_id',
        'get_fansub_reward_metric_value',
        'is_user_eligible_for_fansub_identity_tag'
      ])
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', function_record.signature);
    execute format('grant execute on function %s to service_role', function_record.signature);
  end loop;
end;
$$;

drop policy if exists "Authenticated upload avatars" on storage.objects;
drop policy if exists "Authenticated upload chapter pages" on storage.objects;
drop policy if exists "Authenticated upload manga covers" on storage.objects;
drop policy if exists "Owner delete avatars" on storage.objects;
drop policy if exists "Owner delete chapter pages" on storage.objects;
drop policy if exists "Owner delete manga covers" on storage.objects;
drop policy if exists "Owner update avatars" on storage.objects;
drop policy if exists "Owner update chapter pages" on storage.objects;
drop policy if exists "Owner update manga covers" on storage.objects;

create policy "Scoped upload avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and u.id::text = (storage.foldername(name))[2]
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansub-drafts'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'avatar'
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[3] = 'avatar'
        and (public.current_app_role() = 'admin' or public.is_fansub_staff(((storage.foldername(name))[2])::uuid))
      )
      or (
        -- Legacy draft path: kept only for currently deployed clients; new code writes fansub-drafts/<auth.uid>/avatar.
        (storage.foldername(name))[1] = 'fansub-avatars'
        and owner = auth.uid()
      )
    )
  );

create policy "Scoped update avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      owner = auth.uid()
      or public.current_app_role() = 'admin'
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      owner = auth.uid()
      or public.current_app_role() = 'admin'
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Scoped delete avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      owner = auth.uid()
      or public.current_app_role() = 'admin'
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Scoped upload manga covers"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'manga-covers'
    and (
      (public.current_app_role() = 'admin' and (storage.foldername(name))[1] = 'covers')
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[3] in ('mangas', 'manga-drafts')
        and (storage.foldername(name))[5] = 'cover'
        and (public.current_app_role() = 'admin' or public.is_fansub_staff(((storage.foldername(name))[2])::uuid))
      )
    )
  );

create policy "Scoped update manga covers"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'manga-covers'
    and (
      public.current_app_role() = 'admin'
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  )
  with check (
    bucket_id = 'manga-covers'
    and (
      public.current_app_role() = 'admin'
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Scoped delete manga covers"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'manga-covers'
    and (
      public.current_app_role() = 'admin'
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and public.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Scoped upload chapter pages"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chapter-pages'
    and case
      when coalesce((storage.foldername(name))[1], '') ~* '^manga-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then exists (
        select 1
        from public.mangas m
        where m.id = substring((storage.foldername(name))[1] from '^manga-([0-9a-f-]+)$')::uuid
          and (public.current_app_role() = 'admin' or public.is_fansub_staff(m.fansub_id))
      )
      else false
    end
  );

create policy "Scoped update chapter pages"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'chapter-pages'
    and case
      when coalesce((storage.foldername(name))[1], '') ~* '^manga-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then exists (
        select 1
        from public.mangas m
        where m.id = substring((storage.foldername(name))[1] from '^manga-([0-9a-f-]+)$')::uuid
          and (public.current_app_role() = 'admin' or public.is_fansub_staff(m.fansub_id))
      )
      else false
    end
  )
  with check (
    bucket_id = 'chapter-pages'
    and case
      when coalesce((storage.foldername(name))[1], '') ~* '^manga-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then exists (
        select 1
        from public.mangas m
        where m.id = substring((storage.foldername(name))[1] from '^manga-([0-9a-f-]+)$')::uuid
          and (public.current_app_role() = 'admin' or public.is_fansub_staff(m.fansub_id))
      )
      else false
    end
  );

create policy "Scoped delete chapter pages"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chapter-pages'
    and case
      when coalesce((storage.foldername(name))[1], '') ~* '^manga-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then exists (
        select 1
        from public.mangas m
        where m.id = substring((storage.foldername(name))[1] from '^manga-([0-9a-f-]+)$')::uuid
          and (public.current_app_role() = 'admin' or public.is_fansub_staff(m.fansub_id))
      )
      else false
    end
  );

notify pgrst, 'reload schema';

commit;
