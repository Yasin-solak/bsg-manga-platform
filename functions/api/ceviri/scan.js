import { assertUploadRateLimit } from '../../_shared/upload-rate-limit.js'
import { readStudioOcrTile, StudioOcrTileError } from '../../_shared/studio-ocr-tile.js'
import {
  DETECTION_INSTRUCTIONS, DETECTION_SCHEMA, detectionRequestFor, LANGUAGE_NAMES, mergeDetectedItems, normalizeDetectedItems, runRoutes, sourceLanguageMismatch, watermarkStrokes,
} from '../../_shared/translation-ai.js'
import {
  assertBudget, authenticate, claimJob, errorResponse, finishJob, HttpError, json, loadPageForUser, requireAiAllowed, requireAiPageQuota, requireStudioPermission,
  loadRoutes, methodNotAllowed, readJson, requireUuid, serviceClient, sha256Hex, timed,
} from '../../_shared/translation-http.js'

const MAX_TILE = 1024
const ITEM_COLUMNS = 'id,type,shape,bbox_x,bbox_y,bbox_w,bbox_h,rotation,reading_order,source_text,source_origin,ocr_confidence,source_font_size,manual,cleanup,style,font_suggestion,version,source_version'

function readTile(body, page) {
  const tile = {}
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!Number.isSafeInteger(body[key]) || body[key] < 0) throw new HttpError(400, 'Karo koordinatları geçersiz.')
    tile[key] = body[key]
  }
  if (tile.width < 1 || tile.height < 1 || tile.width > MAX_TILE || tile.height > MAX_TILE
    || tile.x + tile.width > page.width || tile.y + tile.height > page.height) {
    throw new HttpError(400, 'Karo sayfa sınırını aşıyor.')
  }
  return { ...tile, pageWidth: page.width, pageHeight: page.height }
}

/**
 * Splits the page into tiles of at most 1024 px. The tile count is the smallest number that
 * gives at least `overlap` of overlap, and tiles are evenly spaced, so leftover space does not
 * pile up at one edge and a bubble on a boundary is usually fully visible in one tile. Cut-off
 * copies give way to the full copy when saving.
 */
export function planTiles(width, height, size = MAX_TILE, overlap = 256) {
  const axis = (length) => {
    if (length <= size) return [0]
    const count = Math.ceil((length - overlap) / (size - overlap))
    return Array.from({ length: count }, (_, index) => Math.round(index * (length - size) / (count - 1)))
  }
  const tiles = []
  for (const y of axis(height)) {
    for (const x of axis(width)) tiles.push({ x, y, width: Math.min(size, width), height: Math.min(size, height) })
  }
  return tiles
}

/**
 * Watermarks go to the page cleanup layer as repair selections (see watermarkStrokes). The write
 * is optimistic on the layer version; a concurrent save (an editor open on the page) wins and the
 * watermark is left for the user to erase. Returns the number of strokes added.
 */
async function eraseWatermarks(service, page, boxes) {
  if (!boxes.length) return 0
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: layer, error } = await timed(service.from('translation_page_cleanup')
      .select('strokes,version').eq('page_id', page.id).maybeSingle())
    if (error) return 0
    const strokes = Array.isArray(layer?.strokes) ? layer.strokes : []
    const added = watermarkStrokes(strokes, boxes, page.width, page.height)
    if (!added.length) return 0
    const next = [...strokes, ...added].slice(-2000)
    const write = layer
      ? service.from('translation_page_cleanup').update({ strokes: next }).eq('page_id', page.id).eq('version', layer.version).select('version')
      : service.from('translation_page_cleanup').insert({ page_id: page.id, strokes: next }).select('version')
    const { data: saved, error: writeError } = await timed(write)
    if (!writeError && saved?.length) return added.length
  }
  return 0
}

async function post(request, env, deps) {
  const { db, authUser } = await authenticate(request, env, deps.createClient)
  const body = await readJson(request, ['page_id', 'x', 'y', 'width', 'height'])
  const pageId = requireUuid(body.page_id, 'Sayfa kimliği')
  const { page, project } = await loadPageForUser(db, pageId)
  await requireStudioPermission(db, project.fansub_id, 'ceviri.proje')
  await requireAiAllowed(db, project.id)
  await requireAiPageQuota(db, pageId)
  if (page.raw_status !== 'ready') throw new HttpError(409, 'Sayfa henüz yüklenmedi.')
  const tile = readTile(body, page)
  const service = serviceClient(env, deps.createClient)

  const key = `detect:${await sha256Hex([pageId, page.raw_sha256, tile.x, tile.y, tile.width, tile.height].join('|'))}`
  const claim = await claimJob(service, { projectId: project.id, pageId, task: 'detect', key })
  if (claim.state === 'succeeded') return json({ items: [], cached: true })

  try {
    await (deps.assertUploadRateLimit ?? assertUploadRateLimit)({
      request, env, authContext: { authUser }, intent: 'translation-scan',
    })
    await assertBudget(service, env, project.fansub_id)
    const routes = await loadRoutes(service, 'detect')
    const raw = {
      pageId, sha256: page.raw_sha256, mimeType: page.raw_mime_type, byteSize: page.raw_byte_size,
      objectKey: page.raw_object_key, width: page.width, height: page.height,
    }
    const image = await (deps.readTile ?? readStudioOcrTile)(env, raw, tile)
    const run = await runRoutes(routes, env, {
      name: 'manga_text_items',
      schema: DETECTION_SCHEMA,
      instructions: DETECTION_INSTRUCTIONS,
      forProvider: (provider) => detectionRequestFor(provider, tile),
      text: `Dialogue language: ${LANGUAGE_NAMES[project.source_language] ?? project.source_language}. Return the text areas of this tile.`,
      image,
      imageDetail: env.TRANSLATION_IMAGE_DETAIL || 'high',
      maxTokens: 6000,
    }, { fetchImpl: deps.fetch, validate: (data, route) => normalizeDetectedItems(data, tile, detectionRequestFor(route.provider, tile).coordinateSpace) })

    const { data: existing, error: existingError } = await timed(service.from('translation_items')
      .select('id,type,source_text,bbox_x,bbox_y,bbox_w,bbox_h,manual,source_origin').eq('page_id', pageId))
    if (existingError) throw new HttpError(503, 'Sayfa ögeleri okunamadı.')
    // Only automatic (not manually added) OCR items can be replaced by a more complete copy.
    const known = (existing ?? []).map((row) => ({
      id: !row.manual && row.source_origin === 'ocr' ? row.id : null,
      type: row.type, text: row.source_text ?? '',
      x: row.bbox_x, y: row.bbox_y, w: row.bbox_w, h: row.bbox_h,
    }))
    const textItems = run.value.filter((item) => !item.watermark)
    const { insert: fresh, replace } = mergeDetectedItems(known, textItems)
    if (replace.length) {
      const { error: replaceError } = await timed(service.from('translation_items').delete()
        .in('id', replace).eq('page_id', pageId).eq('manual', false).eq('source_origin', 'ocr'))
      if (replaceError) throw new HttpError(503, 'Kesilmiş alanlar güncellenemedi.')
    }
    let inserted = []
    if (fresh.length) {
      const rows = await Promise.all(fresh.map(async (item) => ({
        page_id: pageId,
        type: item.type,
        shape: item.shape,
        bbox_x: item.bbox.x, bbox_y: item.bbox.y, bbox_w: item.bbox.w, bbox_h: item.bbox.h,
        source_text: item.sourceText,
        source_origin: 'ocr',
        ocr_confidence: item.confidence,
        source_font_size: item.fontPx,
        cleanup: item.type === 'sfx' || item.type === 'tabela' ? 'onarim' : 'beyaz',
        reading_order: item.bbox.y,
        detection_key: `ocr:${(await sha256Hex([item.type, item.bbox.x, item.bbox.y, item.bbox.w, item.bbox.h].join('|'))).slice(0, 40)}`,
      })))
      const { data, error } = await timed(service.from('translation_items')
        .upsert(rows, { onConflict: 'page_id,detection_key', ignoreDuplicates: true }).select(ITEM_COLUMNS))
      if (error) throw new HttpError(503, 'Bulunan alanlar kaydedilemedi.')
      inserted = data ?? []
    }
    const erased = await eraseWatermarks(service, page, run.value.filter((item) => item.watermark).map((item) => item.bbox))
    await timed(service.from('translation_pages').update({ scan_stage: 'read', scan_error: null })
      .eq('id', pageId).in('scan_stage', ['uploaded', 'detected', 'read', 'failed']))
    await finishJob(service, claim, { ok: true, route: run.route, usage: run.usage, cost: run.cost })
    const languageHint = sourceLanguageMismatch(project.source_language, textItems)
    return json({ items: inserted, replaced: replace, erased, model: run.route.model, ...(languageHint ? { language_hint: languageHint } : {}) })
  } catch (error) {
    await finishJob(service, claim, { ok: false, error: error?.code ?? error?.message }).catch(() => {})
    throw error
  }
}

export async function handleTranslationScan(request, env, deps = {}) {
  try {
    return await post(request, env, deps)
  } catch (error) {
    if (error instanceof StudioOcrTileError) return json({ error: error.message }, error.status)
    return errorResponse(error)
  }
}

export const onRequestPost = ({ request, env }) => handleTranslationScan(request, env)
export const onRequest = () => methodNotAllowed('POST')
