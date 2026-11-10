import { assertUploadRateLimit } from '../../_shared/upload-rate-limit.js'
import {
  ALT_SCHEMA, altInstructions, batchEntries, DRAFT_SCHEMA, draftInstructions, normalizeAlternatives,
  normalizeDraft, runRoutes,
} from '../../_shared/translation-ai.js'
import {
  assertBudget, authenticate, claimJob, errorResponse, finishJob, HttpError, json, loadPageForUser, requireAiAllowed, requireAiPageQuota, requireStudioPermission,
  loadRoutes, methodNotAllowed, readJson, requireUuid, serviceClient, sha256Hex, timed,
} from '../../_shared/translation-http.js'

const DEFAULT_FONT_SIZE = { balon: 15, anlatim: 15, sfx: 56, tabela: 14 }

/**
 * Okuma sirasi: ogeler dikey bantlara ayrilir; Japonca/Cince mangada bant ici
 * sagdan sola, Korece webtoonda soldan saga okunur.
 */
export function orderItems(items, sourceLanguage) {
  const rtl = sourceLanguage !== 'ko'
  const sorted = [...items].sort((a, b) => a.bbox_y - b.bbox_y)
  const bands = []
  for (const item of sorted) {
    const band = bands.find((entry) => item.bbox_y < entry.bottom - Math.min(entry.height, item.bbox_h) * 0.5)
    if (band) {
      band.items.push(item)
      band.bottom = Math.max(band.bottom, item.bbox_y + item.bbox_h)
    } else {
      bands.push({ items: [item], bottom: item.bbox_y + item.bbox_h, height: item.bbox_h })
    }
  }
  return bands.flatMap((band) => band.items.sort((a, b) => (rtl
    ? (b.bbox_x + b.bbox_w) - (a.bbox_x + a.bbox_w)
    : a.bbox_x - b.bbox_x)))
}

export function suggestedFontSize(item, pageWidth) {
  const base = DEFAULT_FONT_SIZE[item.type] ?? 15
  if (!item.source_font_size) return Math.round(base * Math.max(1, pageWidth / 800))
  // Latin letters are narrower than CJK glyphs, so this stays slightly below the original size.
  return Math.max(8, Math.min(400, Math.round(Number(item.source_font_size) * 0.85)))
}

function mergeUsage(runs) {
  return runs.reduce((sum, run) => ({ input: sum.input + run.usage.input, output: sum.output + run.usage.output }),
    { input: 0, output: 0 })
}

async function post(request, env, deps) {
  const { db, authUser } = await authenticate(request, env, deps.createClient)
  const body = await readJson(request, ['page_id', 'alternatives'])
  const pageId = requireUuid(body.page_id, 'Sayfa kimliği')
  const wantAlternatives = body.alternatives !== false
  const { page, project } = await loadPageForUser(db, pageId)
  await requireStudioPermission(db, project.fansub_id, 'ceviri.proje')
  await requireAiAllowed(db, project.id)
  await requireAiPageQuota(db, pageId)
  const language = project.target_language
  const service = serviceClient(env, deps.createClient)

  const { data: rawItems, error: itemsError } = await timed(service.from('translation_items')
    .select('id,type,bbox_x,bbox_y,bbox_w,bbox_h,source_text,source_font_size,source_version,reading_order')
    .eq('page_id', pageId))
  if (itemsError) throw new HttpError(503, 'Sayfa ögeleri okunamadı.')
  const ordered = orderItems(rawItems ?? [], project.source_language)
  // Reading order is rewritten on each translation; manually added areas join the order too.
  // A separate update per item exceeded the Functions subrequest limit (Free: 50), hence one bulk call.
  const reorder = ordered.flatMap((item, index) => (item.reading_order === index ? [] : [{ id: item.id, reading_order: index }]))
  await applyItemMeta(service, pageId, reorder)

  const { data: texts, error: textsError } = await timed(service.from('translation_item_texts')
    .select('item_id,origin').eq('language', language).in('item_id', ordered.map((item) => item.id)))
  if (textsError) throw new HttpError(503, 'Mevcut çeviriler okunamadı.')
  const human = new Set((texts ?? []).filter((row) => row.origin === 'human').map((row) => row.item_id))
  const pending = ordered.filter((item) => item.source_text.trim() && !human.has(item.id))
  if (!pending.length) return json({ translated: 0, skipped: human.size })

  const draftRoutes = await loadRoutes(service, 'translate_draft')
  const altRoutes = wantAlternatives ? await loadRoutes(service, 'translate_alt') : []
  const key = `translate:${await sha256Hex(JSON.stringify([
    language, pending.map((item) => [item.id, item.source_version]),
    draftRoutes.map((route) => route.model), altRoutes.map((route) => route.model),
  ]))}`
  const claim = await claimJob(service, { projectId: project.id, pageId, task: 'translate_draft', key })
  if (claim.state === 'succeeded') return json({ translated: 0, cached: true })

  try {
    await (deps.assertUploadRateLimit ?? assertUploadRateLimit)({
      request, env, authContext: { authUser }, intent: 'translation-translate',
    })
    await assertBudget(service, env, project.fansub_id)
    const glossary = await loadGlossary(service, project, pending)
    const runs = []
    const drafts = new Map()
    const entries = pending.map((item) => ({ id: item.id, type: item.type, text: item.source_text }))
    for (const batch of batchEntries(entries)) {
      const run = await runRoutes(draftRoutes, env, {
        name: 'manga_translation_draft',
        schema: DRAFT_SCHEMA,
        instructions: draftInstructions(project.source_language, language),
        text: JSON.stringify({ glossary, entries: batch }),
        maxTokens: 8000,
      }, { fetchImpl: deps.fetch, validate: (data) => normalizeDraft(data, batch.map((entry) => entry.id)) })
      runs.push(run)
      for (const [id, value] of run.value) drafts.set(id, { ...value, route: run.route })
    }

    const alternatives = new Map()
    if (altRoutes.length && drafts.size) {
      const altEntries = entries.filter((entry) => drafts.has(entry.id))
        .map((entry) => ({ ...entry, draft: drafts.get(entry.id).text }))
      for (const batch of batchEntries(altEntries)) {
        try {
          const run = await runRoutes(altRoutes, env, {
            name: 'manga_translation_alternatives',
            schema: ALT_SCHEMA,
            instructions: altInstructions(project.source_language, language),
            text: JSON.stringify({ glossary, entries: batch }),
            maxTokens: 8000,
          }, { fetchImpl: deps.fetch, validate: (data) => normalizeAlternatives(data, drafts) })
          runs.push(run)
          for (const [id, alts] of run.value) alternatives.set(id, { alts, route: run.route })
        } catch {
          // Alternatif ek bilgidir; taslak kaydini dusurmez.
        }
      }
    }

    const byId = new Map(pending.map((item) => [item.id, item]))
    const textRows = []
    const suggestionRows = []
    for (const [id, draft] of drafts) {
      const item = byId.get(id)
      textRows.push({
        item_id: id, language, text: draft.text, status: 'oneri', origin: 'machine',
        provider: draft.route.provider, model: draft.route.model, source_version: item.source_version,
      })
      suggestionRows.push({
        item_id: id, language, rank: 0, text: draft.text, provider: draft.route.provider,
        model: draft.route.model, source_version: item.source_version,
      })
      for (const [index, text] of (alternatives.get(id)?.alts ?? []).entries()) {
        const route = alternatives.get(id).route
        suggestionRows.push({
          item_id: id, language, rank: index + 1, text, provider: route.provider,
          model: route.model, source_version: item.source_version,
        })
      }
    }
    if (textRows.length) {
      const { error } = await timed(service.from('translation_item_texts')
        .upsert(textRows, { onConflict: 'item_id,language' }))
      if (error) throw new HttpError(503, 'Çeviri önerileri kaydedilemedi.')
    }
    if (suggestionRows.length) {
      const { error } = await timed(service.from('translation_suggestions')
        .upsert(suggestionRows, { onConflict: 'item_id,language,source_version,rank' }))
      if (error) throw new HttpError(503, 'Çeviri alternatifleri kaydedilemedi.')
    }
    await applyItemMeta(service, pageId, [...drafts].map(([id, draft]) => ({
      id, font_suggestion: { font: draft.font, size: suggestedFontSize(byId.get(id), page.width), reason: draft.reason },
    })))
    const { error: stageError } = await timed(service.from('translation_pages').update({ scan_stage: 'suggested' })
      .eq('id', pageId).in('scan_stage', ['uploaded', 'detected', 'read', 'suggested']))
    if (stageError) throw new HttpError(503, 'Sayfa aşaması kaydedilemedi.')

    const cost = runs.reduce((sum, run) => sum + run.cost, 0)
    await finishJob(service, claim, { ok: true, route: runs[0]?.route, usage: mergeUsage(runs), cost })
    return json({ translated: drafts.size, alternatives: alternatives.size, skipped: human.size })
  } catch (error) {
    await finishJob(service, claim, { ok: false, error: error?.code ?? error?.message }).catch(() => {})
    throw error
  }
}

/** Reading order / font suggestion: the whole page is written with one RPC (service role only). */
export async function applyItemMeta(service, pageId, rows) {
  if (!rows.length) return
  const { error } = await timed(service.rpc('tl_apply_item_meta', { p_page_id: pageId, p_rows: rows }))
  if (error) throw new HttpError(503, 'Öge bilgileri kaydedilemedi.')
}

async function loadGlossary(service, project, items) {
  let query = service.from('translation_glossary').select('source_term,target_term,note,manga_id')
    .eq('fansub_id', project.fansub_id).eq('source_language', project.source_language)
    .eq('target_language', project.target_language).limit(500)
  query = project.manga_id ? query.or(`manga_id.is.null,manga_id.eq.${project.manga_id}`) : query.is('manga_id', null)
  const { data, error } = await timed(query)
  if (error) return []
  const corpus = items.map((item) => item.source_text).join('\n')
  // Only terms that appear on the page are sent, so the request stays short and cheap.
  return (data ?? []).filter((term) => corpus.includes(term.source_term)).slice(0, 60)
    .map((term) => ({ source: term.source_term, target: term.target_term, ...(term.note ? { note: term.note } : {}) }))
}

export async function handleTranslationTranslate(request, env, deps = {}) {
  try {
    return await post(request, env, deps)
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestPost = ({ request, env }) => handleTranslationTranslate(request, env)
export const onRequest = () => methodNotAllowed('POST')
