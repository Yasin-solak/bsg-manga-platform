-- Translation Studio V3: Google opens 2.5 models only to accounts already using them;
-- with a new GEMINI_API_KEY gemini-2.5-flash calls gave
-- provider_error and the scan never ran (real page test).
-- Routes move to current models: image (detect/ocr) and alternative translation
-- gemini-3.8-flash, draft and reader translation the cheap gemini-3.5-flash-lite.
-- Prices USD / 1M tokens (3.8 Flash discounted list price until the end of 2026).
update public.translation_model_routes
   set model = case when task in ('detect', 'ocr', 'translate_alt') then 'gemini-3.8-flash' else 'gemini-3.5-flash-lite' end,
       input_cost_per_mtok = case when task in ('detect', 'ocr', 'translate_alt') then 0.75 else 0.3 end,
       output_cost_per_mtok = case when task in ('detect', 'ocr', 'translate_alt') then 3.75 else 2.5 end
 where provider = 'google' and model = 'gemini-2.5-flash';
