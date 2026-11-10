-- Support reply notification.
--
-- Formerly saving an admin reply sent no notice to the user; the user
-- learned of a reply only by checking Settings > Support. Now
-- when admin_response changes the request owner gets a notification (routes to Settings > Support
-- ). support_requests.user_id is the auth identity; the notification writes to the public.users
-- identity.

begin;

create or replace function support_internal.notify_reply()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid;
begin
  if new.admin_response is distinct from old.admin_response
     and coalesce(char_length(btrim(new.admin_response)), 0) >= 5 then
    select u.id into v_user from public.users u where u.auth_user_id = new.user_id;
    if v_user is not null then
      insert into public.notifications (user_id, type, title, message, icon, data)
      values (
        v_user,
        'system',
        'Destek talebin yanıtlandı',
        '"' || left(new.subject, 80) || '" talebine yanıt verildi.',
        null,
        jsonb_build_object(
          'event', 'support_reply',
          'event_key', 'support-reply:' || new.id || ':' || extract(epoch from now())::bigint,
          'route_hint', '/ayarlar?bolum=destek'
        )
      );
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function support_internal.notify_reply() from public, anon, authenticated;

drop trigger if exists support_request_reply_notify on public.support_requests;
create trigger support_request_reply_notify
  after update of admin_response on public.support_requests
  for each row
  when (old.admin_response is distinct from new.admin_response)
  execute function support_internal.notify_reply();

commit;
