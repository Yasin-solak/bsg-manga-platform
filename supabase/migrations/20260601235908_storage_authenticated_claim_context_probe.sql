-- Isolates the chance that the Storage API picks the authenticated role but does not pass JWT claim GUCs
-- to the DB session. The policy allows only one harmless
-- probe file path and is removed in the durable repair migration.

begin;

drop policy if exists "Temporary authenticated storage claim context probe" on storage.objects;

create policy "Temporary authenticated storage claim context probe"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and name = 'storefront/rls-claim-context-probe/probe.png'
  );

commit;
