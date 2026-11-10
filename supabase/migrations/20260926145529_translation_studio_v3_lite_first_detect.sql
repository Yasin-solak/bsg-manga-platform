-- Translation Studio V3: in a real page test gemini-3.5-flash-lite came out as accurate as 3.8/3.7 on detect/OCR,
-- the cheapest and fastest (~6-12 s per tile); 3.8/3.7
-- gave 429/503 when busy and held each tile for minutes. Lite first,
-- strong models are fallback (if an OpenAI key is added gpt-4.1 comes second).
update public.translation_model_routes set priority = case model when 'gemini-3.5-flash-lite' then 0 when 'gpt-4.1' then 5 else priority end
 where task in ('detect', 'ocr') and model in ('gemini-3.5-flash-lite', 'gpt-4.1');
