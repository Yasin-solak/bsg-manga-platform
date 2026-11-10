import { getActiveLocale, txa } from '@/i18n/activeLocale'

/**
 * DB functions write notification text in Turkish merged with names; the record does not change.
 * In English the patterns are translated at display time, and names stay as is. Text matching no pattern
 * (for example a notification written by hand by an admin) is shown as is.
 */
type Rule = [RegExp, (...parts: string[]) => string]

const placeLabel = (place: string) => txa(place)

const RULES: Rule[] = [
  [/^(.+), "(.+)" mangasinda (.+)\. Bolumu yayinladi\.$/, (who, manga, chapter) => `${who} published chapter ${chapter} of "${manga}".`],
  [/^(.+), "(.+)" mangasini ekledi\.$/, (who, manga) => `${who} added "${manga}".`],
  [/^(.+), "(.+)" mangasina yorum yapti\.$/, (who, manga) => `${who} commented on "${manga}".`],
  [/^(.+), "(.+)" mangasinda yorumuna yanit verdi\.$/, (who, manga) => `${who} replied to your comment on "${manga}".`],
  [/^(.+), manga yorumunda senden bahsetti\.$/, (who) => `${who} mentioned you in a manga comment.`],
  [/^(.+) (\d+(?:\.\d+)?)\. Bolum yayinda\.$/, (manga, chapter) => `${manga} chapter ${chapter} is out.`],
  [/^(.+), (\d+) adet takviye etkinlestirdi\.$/, (who, count) => `${who} activated ${count} boosts.`],
  [/^"(.+)" gorevinden \+(\d+) coin kazandin\.$/, (quest, coins) => `You earned +${coins} coins from the "${txa(quest)}" quest.`],
  [/^"(.+)" fansub talebin onaylandi\.$/, (name) => `Your "${name}" fansub request was approved.`],
  [/^(.+) sana "(.+)" hediye etti\. Not: (.*)$/s, (who, gift, note) => `${who} gifted you "${gift}". Note: ${note}`],
  [/^(.+) sana "(.+)" hediye etti\.$/, (who, gift) => `${who} gifted you "${gift}".`],
  [/^"(.+)" altındaki yorumun moderasyon sonucu kaldırıldı\. Gerekçe: (.+)$/s, (place, reason) => `Your comment under "${place}" was removed by moderation. Reason: ${txa(reason)}`],
  [/^(.+) yorumunuz moderasyon nedeniyle gorunurlukten kaldirildi\. Gerekce: (.+)$/s, (place, reason) => `Your ${placeLabel(place)} comment was removed by moderation. Reason: ${txa(reason)}`],
  [/^(.+) icin gonderdiginiz rapor incelendi ve icerik kaldirildi\.$/, (place) => `Your report on ${placeLabel(place)} was reviewed and the content was removed.`],
  [/^(.+) rapor incelemesi sonucunda gorunurlukten kaldirildi\. Gerekce: (.+)$/s, (place, reason) => `${placeLabel(place)} was removed after a report review. Reason: ${txa(reason)}`],
  [/^(.+) raporlandi ve site yonetimi tarafindan kaldirildi\. Lutfen icerigi duzeltip yeniden incelemeye gonderin\.?$/, (place) => `${placeLabel(place)} was reported and removed by site management. Please fix the content and send it for review again.`],
  [/^(\S+) eventi (\d+) dakika icinde (\d+) kez goruldu\.$/, (event, minutes, count) => `${event} event seen ${count} times in ${minutes} minutes.`],
]

export function translateNotificationMessage(message: string): string {
  if (getActiveLocale() !== 'en') return message
  const exact = txa(message)
  if (exact !== message) return exact
  for (const [pattern, build] of RULES) {
    const match = pattern.exec(message)
    if (match) return build(...match.slice(1))
  }
  return message
}
