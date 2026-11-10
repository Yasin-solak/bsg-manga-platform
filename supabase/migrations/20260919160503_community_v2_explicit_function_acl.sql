-- Project-level default GRANTs can also reach the private schema.
-- Only session-validating API entries and the narrow broadcast policy stay open.
revoke all on all functions in schema community_v2 from public,anon,authenticated;
grant execute on function community_v2.read_api(text,jsonb),community_v2.write_api(text,jsonb),
  community_v2.sync_my_follows(),community_v2.broadcast_allowed(text) to authenticated;
