import { Link } from '@/i18n/router'
import type { AnnouncementReport } from '@/services/announcementV2'
import { intlLocale, txa } from '@/i18n/activeLocale'

const date = (v: string | null) => v ? new Date(v).toLocaleString(intlLocale()) : '—'
export function AnnouncementReportAccounts({ data, loading }: { data: AnnouncementReport; loading: boolean }) {
  return <div className="overflow-x-auto rounded-xl border" aria-busy={loading}><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b bg-muted/40 text-muted-foreground"><tr>{[txa('Hesap'),txa('Durum'),txa('Kart / Açılış / Bağlantı'),txa('Yanıt / Ödül'),txa('Son etkileşim')].map(s => <th key={s} className="px-3 py-3 font-medium">{s}</th>)}</tr></thead><tbody>
    {loading ? <tr><td colSpan={5} className="p-4"><div role="status" aria-label={txa('Hesaplar yükleniyor')} className="h-32 rounded bg-muted motion-safe:animate-pulse" /></td></tr> : data.accounts.map(a => <tr key={a.user_id} className="border-b align-top last:border-0">
      <td className="px-3 py-3"><Link className="font-semibold text-primary hover:underline" to={`/profil/${encodeURIComponent(a.username)}`}>@{a.username}</Link><p className="mt-1 text-muted-foreground">{txa('Seviye {v1} · Kayıt {v2}', { v1: a.level, v2: new Date(a.registered_at).toLocaleDateString(intlLocale()) })}</p></td>
      <td className="px-3 py-3"><p>{a.banned ? txa('Yasaklı') : a.active ? txa('Aktif') : txa('Pasif')} · {a.premium ? txa('Premium') : txa('Standart')}</p><p className="mt-1 text-muted-foreground">{txa('E-posta {v1}', { v1: a.verified ? txa('doğrulanmış') : txa('doğrulanmamış') })}</p></td>
      <td className="px-3 py-3 tabular-nums">{a.clicks} / {a.opens} / {a.links}{a.opened && !a.opens && <p className="mt-1 text-muted-foreground">{txa('Önceki açılış kaydı var')}</p>}</td>
      <td className="px-3 py-3"><p>{data.options.find(o => o.id === a.response)?.label || txa('Yanıt yok')}</p>{a.response_at && <p className="mt-1 text-muted-foreground">{date(a.response_at)}</p>}{a.claimed_at && <p className="mt-1 text-primary">{txa('{v1} coin · {v2}', { v1: a.claimed_coins, v2: date(a.claimed_at) })}</p>}</td>
      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{date(a.last_activity)}</td>
    </tr>)}
    {!loading && !data.accounts.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{txa('Bu filtreye uygun hesap yok.')}</td></tr>}
  </tbody></table></div>
}
