-- Community post decision notification v2 (Admin > Community redesign).
--
-- 1) When a published post is rejected ("Yayindan kaldir") the author is told the
-- reason. Formerly only pending -> approve / reject produced a notification;
-- the author of an unpublished post never learned why.
-- 2) Notification texts in Turkish (formerly ASCII: "gonderin onaylandi").
--
-- push_notification dedupes durably with event_key. Pending -> approve / reject
-- keys stay as is (behavior unchanged); the unpublish key contains the
-- rejection time: if the same post is republished and removed again
-- the author is told again, while a double trigger of the same decision dedupes.

create or replace function public.notify_community_post_reviewed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_post_title text := coalesce(nullif(trim(coalesce(new.title, '')), ''), 'Topluluk gönderisi');
  v_note text := nullif(trim(coalesce(new.reject_reason, '')), '');
  v_unpublished boolean := old.status = 'approved' and new.status = 'rejected';
  v_title text;
  v_body text;
  v_event_key text;
begin
  if not ((old.status = 'pending' and new.status in ('approved', 'rejected')) or v_unpublished) then
    return new;
  end if;

  if new.author_id is null then
    return new;
  end if;

  if new.status = 'approved' then
    v_title := 'Topluluk gönderin onaylandı';
    v_body := format('"%s" başlıklı topluluk gönderin yayına alındı.', v_post_title);
  elsif v_unpublished then
    v_title := 'Topluluk gönderin yayından kaldırıldı';
    v_body := format('"%s" başlıklı topluluk gönderin yayından kaldırıldı.', v_post_title);
  else
    v_title := 'Topluluk gönderin reddedildi';
    v_body := format('"%s" başlıklı topluluk gönderin reddedildi.', v_post_title);
  end if;

  if new.status = 'rejected' and v_note is not null then
    v_body := v_body || format(' Gerekçe: %s', v_note);
  end if;

  if v_unpublished then
    v_event_key := format(
      'community-post-review:%s:unpublished:%s:%s',
      new.id::text,
      new.author_id::text,
      floor(extract(epoch from coalesce(new.rejected_at, now())))::bigint::text
    );
  else
    v_event_key := format('community-post-review:%s:%s:%s', new.id::text, new.status, new.author_id::text);
  end if;

  perform public.push_notification(
    new.author_id,
    'system',
    v_title,
    v_body,
    jsonb_build_object(
      'event', 'community_post_review',
      'post_id', new.id,
      'post_title', v_post_title,
      'status', new.status,
      'previous_status', old.status,
      'reject_reason', new.reject_reason,
      'route_hint', format('/discussion/%s', new.id::text),
      'event_key', v_event_key
    )
  );

  return new;
end;
$function$;
