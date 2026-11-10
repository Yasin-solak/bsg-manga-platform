-- Admin > Users v2: user desk views.
-- * List: 'staff' (admin + moderator), 'banned' (active ban) and 'review'
-- (same condition as "low trust review" in the summary) views; the page
-- limit rises to 20 (desk pages of 20).
-- * Summary: active banned account count ('banned').

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

select pg_temp.mz_patch(
  'app_private.list_admin_user_management_page(integer,text,text,text,text,text,text,timestamp with time zone,uuid,timestamp with time zone)',
  array[
    $p$if v_limit < 1 or v_limit > 10 then\n    raise exception using errcode = '22023', message = 'Sayfa limiti 1 ile 10 arasinda olmalidir\.';$p$,
    $p$if v_view not in \('all', 'admin', 'moderator', 'user', 'new'\) then$p$,
    $p$or \(v_view in \('admin', 'moderator', 'user'\) and u\.role = v_view\)\n$p$
  ],
  array[
    $r$if v_limit < 1 or v_limit > 20 then
    raise exception using errcode = '22023', message = 'Sayfa limiti 1 ile 20 arasinda olmalidir.';$r$,
    $r$if v_view not in ('all', 'admin', 'moderator', 'user', 'new', 'staff', 'banned', 'review') then$r$,
    $r$or (v_view in ('admin', 'moderator', 'user') and u.role = v_view)
      or (v_view = 'staff' and u.role in ('admin', 'moderator'))
      or (
        v_view = 'banned'
        and coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > p_as_of)
      )
      or (
        v_view = 'review'
        and trust.score < 60
        and trust.confidence <> 'low'
        and not (
          coalesce(u.is_banned, false)
          and (u.ban_until is null or u.ban_until > p_as_of)
        )
      )
$r$
  ]
);

select pg_temp.mz_patch(
  'app_private.get_admin_user_management_overview(timestamp with time zone)',
  array[
    $p$'lowTrustReview', coalesce\(v_low_trust_review, 0\),$p$
  ],
  array[
    $r$'lowTrustReview', coalesce(v_low_trust_review, 0),
    'banned', (
      select pg_catalog.count(*)::integer
      from public.users as b
      where coalesce(b.is_banned, false)
        and (b.ban_until is null or b.ban_until > p_as_of)
    ),$r$
  ]
);
