import { txa } from '@/i18n/activeLocale'
/**
 * Report reasons (prototype: report bottom sheet).
 *
 * The prototype puts an explanation line UNDER each reason. Its function is not decoration:
 * "Spoiler" alone did not say whether it means "has spoiler content" or "spoiler
 * NOT LABELED", and a report with a wrong reason has to be read once more
 * in moderation.
 *
 * `value` is the text written to the DATABASE (`reports.reason`). Free text,
 * not an enum, so labels can be updated. OLD REPORTS keep their old
 * text; the admin list will look mixed for a while, which is
 * expected (the reason is a descriptive field, not a classification key).
 */

export interface ReportReasonOption {
  /** Veritabanina yazilan deger. */
  value: string
  description: string
}

export const REPORT_REASON_OPTIONS: readonly ReportReasonOption[] = [
  { value: 'Spam veya reklam', get description() { return txa('Alakasız tanıtım, tekrarlayan içerik') } },
  { value: 'Etiketsiz spoiler', get description() { return txa('Uyarı olmadan hikâye detayı veriyor') } },
  { value: 'Taciz veya hakaret', get description() { return txa('Kişiyi hedef alan saldırgan dil') } },
  { value: 'Uygunsuz icerik', get description() { return txa('Yaş sınırı gerektiren görsel veya metin') } },
  { value: 'Diğer', get description() { return txa('Yukarıdakilerin dışında bir sorun') } },
]

export const REPORT_REASONS = REPORT_REASON_OPTIONS.map((option) => option.value)

/** The free text field makes sense ONLY for this reason. */
export const FREE_TEXT_REASON = 'Diğer'
