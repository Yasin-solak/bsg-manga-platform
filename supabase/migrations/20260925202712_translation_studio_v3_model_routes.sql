-- Translation Studio V3: cost-focused model routing.
-- A provider with no key defined is skipped at runtime (translation-ai.js runRoutes),
-- so Anthropic/Gemini routes fall to OpenAI until a key is added.
-- Prices are USD per 1M tokens (input / output).

update public.translation_model_routes set input_cost_per_mtok = 2, output_cost_per_mtok = 8
  where provider = 'openai' and model = 'gpt-4.1';
update public.translation_model_routes set input_cost_per_mtok = 0.4, output_cost_per_mtok = 1.6
  where provider = 'openai' and model = 'gpt-4.1-mini';

-- Cheap model first: drafts and reader languages Gemini Flash, alternatives Claude Haiku.
update public.translation_model_routes set priority = 10
  where provider = 'openai' and task in ('translate_draft', 'translate_alt', 'translate_reader', 'font_suggest');

insert into public.translation_model_routes
  (task, priority, provider, model, input_cost_per_mtok, output_cost_per_mtok) values
  ('translate_draft', 0, 'google', 'gemini-2.5-flash', 0.3, 2.5),
  ('translate_reader', 0, 'google', 'gemini-2.5-flash', 0.3, 2.5),
  ('translate_alt', 0, 'anthropic', 'claude-haiku-4-5', 1, 5),
  ('detect', 10, 'google', 'gemini-2.5-flash', 0.3, 2.5)
on conflict (task, provider, model) do update
  set priority = excluded.priority,
      input_cost_per_mtok = excluded.input_cost_per_mtok,
      output_cost_per_mtok = excluded.output_cost_per_mtok;
