-- Retention for tables that only grow:
-- * pg_cron never trims its own run log (about 2,300 rows a day here).
-- * public.prune_activity_events existed but was never scheduled.
-- * Anonymous read trackers are only needed for the 5-minute and 45-second
--   de-duplication windows in track_manga_read. Signed-in trackers are kept,
--   because announcement conditions count the chapters a member has read.

select cron.schedule(
  'cron-run-details-retention',
  '23 3 * * *',
  $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$
);

select cron.schedule(
  'activity-events-retention',
  '41 3 * * *',
  $job$select public.prune_activity_events()$job$
);

select cron.schedule(
  'anon-read-trackers-retention',
  '53 3 * * *',
  $job$delete from public.manga_read_trackers where reader_key like 'anon:%' and last_read_at < now() - interval '2 days'$job$
);
