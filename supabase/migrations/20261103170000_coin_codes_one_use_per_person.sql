-- Coin codes: a person uses a code only once (user decision
-- 2026-11-03). Formerly a 'both' targeted code with a use limit above 1 could be loaded by the same
-- person to their own balance and to EVERY fansub vault they manage
-- separately (uniqueness was separate for person+code and fansub+code).
-- The check searches both tables; the code row is locked FOR UPDATE
-- so it also holds on concurrent attempts. (Live data had no double
-- use.)

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

select pg_temp.mz_patch('app_private.redeem_coin_code(text,text,uuid)', array[
  $p$elsif v_target = 'user' and exists \(select 1 from public\.user_code_redemptions r where r\.user_id = v_user and r\.code_id = v_code\.id\) then\n    v_error := 'Bu kodu zaten kullandın\.';$p$
], array[
  $r$elsif exists (select 1 from public.user_code_redemptions r where r.user_id = v_user and r.code_id = v_code.id)
     or exists (select 1 from public.fansub_code_redemptions r where r.redeemed_by = v_user and r.code_id = v_code.id) then
    v_error := 'Bu kodu zaten kullandın. Bir kod kişi başına bir kez kullanılır.';$r$
]);

create index if not exists fansub_code_redemptions_redeemed_by_code_idx
  on public.fansub_code_redemptions (redeemed_by, code_id);
