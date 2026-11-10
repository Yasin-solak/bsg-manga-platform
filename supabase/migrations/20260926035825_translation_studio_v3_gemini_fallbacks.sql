-- Translation Studio V3: since only GEMINI_API_KEY is defined in production,
-- re-read (ocr) and alternative translations (translate_alt) can fall to Gemini Flash.
-- A provider with no key is skipped at runtime.
insert into public.translation_model_routes (task, priority, provider, model, input_cost_per_mtok, output_cost_per_mtok) values
  ('ocr', 10, 'google', 'gemini-2.5-flash', 0.3, 2.5),
  ('translate_alt', 20, 'google', 'gemini-2.5-flash', 0.3, 2.5)
on conflict (task, provider, model) do update
  set priority = excluded.priority,
      input_cost_per_mtok = excluded.input_cost_per_mtok,
      output_cost_per_mtok = excluded.output_cost_per_mtok;
