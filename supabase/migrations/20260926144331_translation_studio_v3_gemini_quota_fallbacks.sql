-- Translation Studio V3: in a real page test gemini-3.8-flash gave 429 (quota) and
-- 503 (busy). Google quotas are per model; Gemini models with separate quotas
-- are added as fallback routes for the same task (a keyless provider is skipped).
insert into public.translation_model_routes (task, priority, provider, model, input_cost_per_mtok, output_cost_per_mtok) values
  ('detect', 20, 'google', 'gemini-3.7-flash', 0.75, 3.75),
  ('detect', 30, 'google', 'gemini-3.5-flash-lite', 0.3, 2.5),
  ('ocr', 20, 'google', 'gemini-3.7-flash', 0.75, 3.75),
  ('ocr', 30, 'google', 'gemini-3.5-flash-lite', 0.3, 2.5),
  ('translate_draft', 20, 'google', 'gemini-3.7-flash', 0.75, 3.75),
  ('translate_reader', 20, 'google', 'gemini-3.7-flash', 0.75, 3.75),
  ('translate_alt', 30, 'google', 'gemini-3.5-flash-lite', 0.3, 2.5)
on conflict (task, provider, model) do update
  set priority = excluded.priority,
      input_cost_per_mtok = excluded.input_cost_per_mtok,
      output_cost_per_mtok = excluded.output_cost_per_mtok;
