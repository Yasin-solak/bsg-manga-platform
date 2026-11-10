import { balloonSearchCrop, findBalloonRegion, snapBoxToBalloon } from '@/lib/mangaTypeset/balloonRegion'
import { studioAccessToken } from '@/services/studioAuth'
import { loadPageItems, saveItem, TlConflictError, type TlItem } from '@/services/translationEditorService'
import { createScopedLogger } from '@/services/logger'
import { rawPageUrl } from '@/services/translationStudioService'
import { txa } from '@/i18n/activeLocale'

const balloonSnapLogger = createScopedLogger('translationStudio.balloonSnap')

/*
 * After scanning, fits balloon/narration boxes to the balloon's interior. The model gives a box by the
 * vertical text column; translated text should go in the balloon, not that narrow column.
 * Manually added items, lasso polygons and items with no found balloon are untouched; writes are
 * version controlled (an item changed in the editor is not overwritten).
 */

export function snappable(item: TlItem) {
  return (item.type === 'balon' || item.type === 'anlatim') && !item.manual && !(item.polygon && item.polygon.length >= 3)
}

async function loadRawCanvas(pageId: string, signal?: AbortSignal) {
  const token = await studioAccessToken()
  if (!token) throw new Error(txa('Oturumun sona ermiş. Yeniden giriş yap.'))
  const response = await fetch(rawPageUrl(pageId), { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!response.ok) throw new Error(txa('Ham sayfa okunamadı.'))
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error(txa('Sayfa tuvali açılamadı.'))
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return { context, width: canvas.width, height: canvas.height }
}

/** Sayfadaki uygun ogeleri balonlara oturtur; guncellenen oge sayisini dondurur. */
export async function snapPageItemsToBalloons(pageId: string, signal?: AbortSignal): Promise<number> {
  const all = await loadPageItems(pageId, 'tr', signal)
  const items = all.filter(snappable)
  if (!items.length) return 0
  const { context, width, height } = await loadRawCanvas(pageId, signal)
  let updated = 0
  for (const item of items) {
    if (signal?.aborted) break
    const crop = balloonSearchCrop(item, width, height)
    if (crop.w < 8 || crop.h < 8) continue
    const image = context.getImageData(crop.x, crop.y, crop.w, crop.h)
    const region = findBalloonRegion(image.data, crop.w, crop.h, { x: item.x - crop.x, y: item.y - crop.y, w: item.w, h: item.h })
    const others = all.filter((other) => other.id !== item.id)
    const target = snapBoxToBalloon(region, crop, item, others)
    if (!target) continue
    try {
      await saveItem(item, target)
      updated += 1
    } catch (error) {
      if (!(error instanceof TlConflictError)) throw error
      // The item changed in the editor: the user's edit is kept and fitting is skipped.
      balloonSnapLogger.info('balon oturtma atlandi: oge baska oturumda degisti', { itemId: item.id })
    }
  }
  return updated
}
