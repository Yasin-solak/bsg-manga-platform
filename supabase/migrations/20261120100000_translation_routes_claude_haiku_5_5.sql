-- Route every translation task to Claude Haiku 5.5 first (vision-capable, USD 0.10 / 0.50 per 1M tokens).
-- Existing routes move one step back and stay enabled as fallbacks; runRoutes skips providers without a key.
-- Haiku 4.5 is superseded on translate_alt and disabled.
update public.translation_model_routes set priority = priority + 1
  where not (provider = 'anthropic' and model = 'claude-haiku-5-5') and priority < 99;

insert into public.translation_model_routes
  (task, priority, provider, model, input_cost_per_mtok, output_cost_per_mtok, enabled) values
  ('detect', 0, 'anthropic', 'claude-haiku-5-5', 0.1, 0.5, true),
  ('ocr', 0, 'anthropic', 'claude-haiku-5-5', 0.1, 0.5, true),
  ('translate_draft', 0, 'anthropic', 'claude-haiku-5-5', 0.1, 0.5, true),
  ('translate_alt', 0, 'anthropic', 'claude-haiku-5-5', 0.1, 0.5, true),
  ('translate_reader', 0, 'anthropic', 'claude-haiku-5-5', 0.1, 0.5, true),
  ('font_suggest', 0, 'anthropic', 'claude-haiku-5-5', 0.1, 0.5, true)
on conflict (task, provider, model) do update
  set priority = excluded.priority,
      input_cost_per_mtok = excluded.input_cost_per_mtok,
      output_cost_per_mtok = excluded.output_cost_per_mtok,
      enabled = excluded.enabled;

update public.translation_model_routes set enabled = false
  where provider = 'anthropic' and model = 'claude-haiku-4-5';
