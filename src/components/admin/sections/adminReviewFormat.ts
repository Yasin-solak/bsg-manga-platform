import { intlLocale, txa } from '@/i18n/activeLocale'
export function reviewDate(value: string | null) {
  return value ? new Date(value).toLocaleString(intlLocale()) : txa('Henüz yok')
}
