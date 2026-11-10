-- On joining a Realtime private channel read permission is also asked for broadcast (supabase-js
-- sends a broadcast setting on each channel); allowing only presence rejected the join
-- with "Unauthorized" (caught in a live test). Nobody has broadcast WRITE permission on this topic
-- ; read permission only makes joining possible.
drop policy if exists tl_page_presence_receive on realtime.messages;
create policy tl_page_presence_receive on realtime.messages for select to authenticated
  using (extension in ('presence', 'broadcast') and app_private.tl_presence_allowed((select realtime.topic())));
