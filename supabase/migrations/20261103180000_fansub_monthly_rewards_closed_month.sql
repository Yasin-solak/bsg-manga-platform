-- Monthly fansub reward: only a FINISHED month distributes.
--
-- BUG: run_fansub_monthly_rewards could run before the month ended (even before it began);
-- the reward paid by views so far and the month locked "completed"
-- so it could not run again after the month ended. Live: February 2026 ran on Feb 14
-- (32,000 coins to 4 fansubs on half-month data), March 2026 ran on Feb 21 (0 coins,
-- locked). This fix does not touch past records.

create or replace function pg_temp.mz_patch(fn regprocedure, patterns text[], replacements text[])
returns void
language plpgsql
as $f$
declare
  d text := replace(pg_get_functiondef(fn), E'\r', '');
  n text;
  i integer;
begin
  for i in 1..coalesce(array_length(patterns, 1), 0) loop
    n := regexp_replace(d, patterns[i], replacements[i]);
    if n = d then
      raise exception 'mz_patch %: desen eslesmedi: %', fn, left(patterns[i], 80);
    end if;
    d := n;
  end loop;
  execute d;
end
$f$;

select pg_temp.mz_patch('app_private.run_fansub_monthly_rewards(date)', array[
  $p$  if not public\.is_admin\(\) then\n    raise exception 'Bu islem sadece admin tarafindan calistirilabilir\.';\n  end if;\n$p$
], array[
  $r$  if not public.is_admin() then
    raise exception 'Bu islem sadece admin tarafindan calistirilabilir.';
  end if;

  if v_month_start >= date_trunc('month', now())::date then
    raise exception 'Ay bitmeden ödül dağıtılamaz; % ayı bittikten sonra çalıştır.', v_month_label;
  end if;
$r$
]);
