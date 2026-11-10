import { useState } from 'react'
import { Languages } from 'lucide-react'
import {
  ADMIN_TRANSLATION_LANGUAGES,
  requestAdminReaderTranslation,
  TL_ITEM_TYPE_LABEL,
  type AdminChapterReviewItem,
} from '@/services/translationAdminReviewService'
import { describeStudioError } from '@/pages/translationStudio/studioErrors'
import { Button } from '@/components/ui/button'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/*
 * Page text table (order, type, original, Turkish, other languages) and reader language
 * generation. Generation calls reader-translate in admin scope; the 18+ rule and
 * budget limits apply on the server, and error codes are explained with studioErrors.
 */

const STATUS_LABEL: Record<string, string> = { get onayli() { return txa('onaylı') }, get oneri() { return txa('öneri') }, eksik: 'eksik' }

export function AdminChapterTextsTable({ items, languages }: { items: AdminChapterReviewItem[], languages: string[] }) {
  const others = languages.filter((language) => language !== 'tr')
  if (items.length === 0) {
    return <p className="m-0 rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">{txa('Bu sayfada metin alanı yok.')}</p>
  }
  return (
    <div className="max-h-[40vh] overflow-auto rounded-lg border border-border" data-testid="admin-chapter-texts">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-muted text-[11px] text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-semibold">{txa('Sıra')}</th>
            <th className="px-2 py-1.5 font-semibold">{txa('Tür')}</th>
            <th className="px-2 py-1.5 font-semibold">{txa('Orijinal')}</th>
            <th className="px-2 py-1.5 font-semibold">{txa('Türkçe')}</th>
            {others.map((language) => <th key={language} className="px-2 py-1.5 font-semibold uppercase">{language}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} className="border-t border-border align-top">
              <td className="px-2 py-1.5 text-muted-foreground">{index + 1}</td>
              <td className="px-2 py-1.5">{TL_ITEM_TYPE_LABEL[item.type] ?? item.type}</td>
              <td className="max-w-[16rem] whitespace-pre-wrap break-words px-2 py-1.5">{item.source_text || '—'}</td>
              {['tr', ...others].map((language) => {
                const text = item.texts[language]
                return (
                  <td key={language} className="max-w-[16rem] whitespace-pre-wrap break-words px-2 py-1.5">
                    {text?.text || <span className="text-muted-foreground">—</span>}
                    {text ? <span className="ml-1 text-[10px] text-muted-foreground">({STATUS_LABEL[text.status] ?? text.status}{text.origin === 'machine' ? txa(', makine') : ''})</span> : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminChapterTranslate({ chapterId, isMature, onDone }: {
  chapterId: string
  isMature: boolean
  onDone: () => void
}) {
  const [language, setLanguage] = useState<string>(ADMIN_TRANSLATION_LANGUAGES[0].code)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error', title: string, hint?: string } | null>(null)

  async function run() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    let translated = 0
    try {
      // The server translates at most 40 items per request; it continues if any remain.
      for (let round = 0; round < 25; round += 1) {
        const result = await requestAdminReaderTranslation(chapterId, language)
        translated += result.translated
        if (result.remaining === 0 || result.translated === 0) break
      }
      setMessage({ tone: 'ok', title: translated ? txa('{v1} öğe çevrildi.', { v1: translated }) : txa('Bu dilde eksik metin yok.') })
      onDone()
    } catch (error) {
      const info = describeStudioError(error, txa('Çeviri başarısız.'))
      toast.error(info.title)
      setMessage({ tone: 'error', title: translated ? txa('{v1} öğe çevrildi, sonra durdu: {v2}', { v1: translated, v2: info.title }) : info.title, hint: info.hint })
      if (translated) onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5" data-testid="admin-chapter-translate">
      <div className="flex flex-wrap items-center gap-2">
        <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
        <label htmlFor={`admin-lang-${chapterId}`} className="text-xs font-medium">{txa('Yeni dile çevir')}</label>
        <select
          id={`admin-lang-${chapterId}`}
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-xs"
          disabled={busy}
        >
          {ADMIN_TRANSLATION_LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
        </select>
        <Button type="button" size="sm" className="min-h-9" disabled={busy || isMature} onClick={() => { void run() }}>
          {busy ? txa('Çevriliyor…') : txa('Üret')}
        </Button>
        {isMature ? <span className="text-[11px] text-muted-foreground">{txa('+18 seri: yapay zekâ kapalı.')}</span> : null}
      </div>
      {message ? (
        <p className={message.tone === 'error' ? 'm-0 text-xs text-destructive' : 'm-0 text-xs text-emerald-600 dark:text-emerald-400'}>
          {message.title}
          {message.hint ? <span className="block text-muted-foreground">{message.hint}</span> : null}
        </p>
      ) : null}
    </div>
  )
}

/** Texts of the selected page + new language generation for the chapter. */
export function AdminChapterTexts({ chapterId, items, languages, isMature, onTranslated }: {
  chapterId: string
  items: AdminChapterReviewItem[]
  languages: string[]
  isMature: boolean
  onTranslated: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Sayfadaki metinler ({v1})', { v1: items.length })}</span>
        <AdminChapterTranslate chapterId={chapterId} isMature={isMature} onDone={onTranslated} />
      </div>
      <AdminChapterTextsTable items={items} languages={languages} />
    </div>
  )
}
