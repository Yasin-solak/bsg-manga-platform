-- If the live /magaza showcase is empty copy the test storefront surface with routes moved to live.
-- Runs on purpose only on setups with an empty campaign array; does not touch an existing live showcase.

update public.site_settings
set storefront_runtime_config = jsonb_set(
  storefront_runtime_config,
  '{surfaces,live_store_home}',
  (
    replace(
      replace(
        replace(
          coalesce((storefront_runtime_config #> '{surfaces,test_store_home}')::text, '{}'::jsonb::text),
          'route:/test/one-cikanlar',
          'route:/magaza/one-cikanlar'
        ),
        'route:/test/goz-at',
        'route:/magaza/goz-at'
      ),
      'route:/test/premium',
      'route:/magaza/premium'
    )::jsonb
  ),
  true
)
where id = 1
  and storefront_runtime_config is not null
  and jsonb_array_length(coalesce(storefront_runtime_config #> '{surfaces,test_store_home,campaigns}', '[]'::jsonb)) > 0
  and jsonb_array_length(coalesce(storefront_runtime_config #> '{surfaces,live_store_home,campaigns}', '[]'::jsonb)) = 0;