import type { Chapter } from '@/types'
import { txa } from '@/i18n/activeLocale'

/** Use the saved server response; a submitted date alone is not proof of publishing. */
export function getChapterCreationFeedback(chapter: Chapter, nowMs = Date.now()) {
  if (chapter.isApproved === false) {
    return { title: txa('Bölüm onay bekliyor'), description: txa('Bölüm kaydedildi ve yönetici onayına gönderildi.') }
  }
  if (chapter.isActive === false) {
    return { title: txa('Bölüm kaydedildi'), description: txa('Bölüm pasif durumda; henüz yayında değil.') }
  }
  const publishAtMs = chapter.publishAt ? Date.parse(chapter.publishAt) : NaN
  // Do not promise publication by assuming approval/activeness on old or incomplete responses.
  if (chapter.isApproved !== true || chapter.isActive !== true || !Number.isFinite(publishAtMs)) {
    return { title: txa('Bölüm kaydedildi'), description: txa('Yayın durumunu bölüm listesinden kontrol edebilirsin.') }
  }
  if (publishAtMs > nowMs) {
    return { title: txa('Bölüm planlandı'), description: txa('Bölüm onaylandı; seçilen yayın tarihini bekliyor.') }
  }
  return { title: txa('Bölüm yayına alındı'), description: txa('Bölüm onaylandı ve yayın tarihi geldi. Okuyucu erişimi mevcut yayın kurallarına bağlıdır.') }
}
