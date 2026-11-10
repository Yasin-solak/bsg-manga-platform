-- Translation Studio: "who is on the same page" (Realtime presence).
-- Private channel "tl-page:<page uuid>"; joining and state broadcast are open only to a user
-- who can see that page (ceviri.gor).

create or replace function app_private.tl_presence_allowed(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $function$
declare
  v_page uuid;
begin
  if p_topic is null or p_topic !~ '^tl-page:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_page := pg_catalog.substr(p_topic, 9)::uuid;
  return app_private.tl_can_page(v_page);
end;
$function$;
grant execute on function app_private.tl_presence_allowed(text) to authenticated;

create policy tl_page_presence_receive on realtime.messages for select to authenticated
  using (extension = 'presence' and app_private.tl_presence_allowed((select realtime.topic())));

create policy tl_page_presence_track on realtime.messages for insert to authenticated
  with check (extension = 'presence' and app_private.tl_presence_allowed((select realtime.topic())));
