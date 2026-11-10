import type { PendingItem } from './pendingSectionUtils'
import { txa } from '@/i18n/activeLocale'

/*
 * Pending approval rejection reasons. The text goes directly to the applicant / author / team;
 * a preset can be picked and edited.
 */
export interface PendingRejectPreset {
  id: string
  label: string
  message: string
}

const FANSUB_REQUEST: PendingRejectPreset[] = [
  { id: 'missing_info', get label() { return txa('Eksik bilgi') }, get message() { return txa('Başvuruda zorunlu alanlar eksik görünüyor. Ayrıntıları tamamlayıp yeniden başvurabilirsin.') } },
  { id: 'copyright_risk', get label() { return txa('Telif riski') }, get message() { return txa('Başvuruda telif / DMCA açısından risk görüldü. İçerik politikanı netleştirip yeniden başvurabilirsin.') } },
  { id: 'name_conflict', get label() { return txa('İsim çakışması') }, get message() { return txa('Fansub adı ya da adresi başka bir toplulukla çakışıyor. Farklı bir adla yeniden başvurabilirsin.') } },
]

const REVISION: PendingRejectPreset[] = [
  { id: 'wrong_info', get label() { return txa('Hatalı bilgi') }, get message() { return txa('Değişiklikte eksik ya da hatalı bilgi var; düzeltip yeniden gönderin.') } },
  { id: 'quality', get label() { return txa('Kalite yetersiz') }, get message() { return txa('Görsel / sayfa kalitesi yayın standardının altında.') } },
  { id: 'source', get label() { return txa('Kaynakla uyuşmuyor') }, get message() { return txa('Değişiklik serinin kaynağıyla uyuşmuyor.') } },
]

export function pendingRejectPresets(item: PendingItem): PendingRejectPreset[] {
  if (item.type === 'fansub_request') return FANSUB_REQUEST
  if (item.revisionId) return REVISION
  return []
}

/**
 * Clear statement of the rejection result. Rejecting a new manga / chapter request DELETES the record
 * (cannot be undone); on a revision rejection the published version stays as is.
 */
export function pendingRejectConsequence(item: PendingItem): { text: string, destructive: boolean } {
  if (item.revisionId) return { text: txa('Yayındaki sürüm aynen kalır; gerekçe ekibe iletilir.'), destructive: false }
  if (item.type === 'manga') return { text: txa('Manga kaydı kalıcı olarak silinir. Bu işlem geri alınamaz.'), destructive: true }
  if (item.type === 'chapter') return { text: txa('Bölüm kaydı ve sayfaları kalıcı olarak silinir. Bu işlem geri alınamaz.'), destructive: true }
  return { text: txa('Başvuru reddedilir; gerekçe başvurana iletilir.'), destructive: false }
}

/** Reason field: required (application), optional (revision) or none (a new record is deleted). */
export function pendingRejectReasonMode(item: PendingItem): 'required' | 'optional' | 'none' {
  if (item.type === 'fansub_request') return 'required'
  if (item.revisionId) return 'optional'
  return 'none'
}
