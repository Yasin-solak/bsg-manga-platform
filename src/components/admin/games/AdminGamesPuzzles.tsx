import { useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { setAdminDailyPuzzle, type DailyGamesOverview } from '@/services/adminDailyGamesService'
import { listMangas } from '@/services/mangaService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/*
 * Puzzles: answers for past and future days (admin only). Tomorrow's puzzle, or today's if nobody has
 * played yet, can be picked by hand; otherwise the server picks automatically.
 */

const KIND_LABEL = { get cover() { return txa('Günün Kapağı') }, get panel() { return txa('Panel Avı') } } as const

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function AdminGamesPuzzles({ overview, onChanged }: { overview: DailyGamesOverview, onChanged: () => void }) {
  const [kind, setKind] = useState<'cover' | 'panel'>('cover')
  const [date, setDate] = useState(() => addDays(overview.today, 1))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string, title: string }>>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      void listMangas({ search: q, sort: 'popular', page: 1, limit: 8 })
        .then((page) => { if (!cancelled) setResults((page.data || []).map((manga) => ({ id: manga.id, title: manga.title }))) })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query])

  // Changing an already planned answer first passes a dialog stating the current answer.
  const ask = (mangaId: string, title: string) => {
    const planned = overview.puzzles.find((puzzle) => puzzle.date === date && puzzle.kind === kind)
    if (!planned?.title) {
      void choose(mangaId, title)
      return
    }
    setConfirm({
      title: txa('{v1} cevabını değiştir', { v1: KIND_LABEL[kind] }),
      subject: txa('{v1} · şu an: {v2}', { v1: date, v2: planned.title }),
      consequence: txa('Cevap "{v1}" olur.{v2}', { v1: title, v2: planned.plays > 0 ? txa(' Bu bulmacayı {v1} kişi oynadı; sunucu, oynanmış bulmacanın değişmesine izin vermez.', { v1: planned.plays }) : txa(' Henüz kimse oynamadı.') }),
      confirmLabel: txa('Değiştir'),
      run: () => choose(mangaId, title),
    })
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    try {
      await confirm.run()
      setConfirm(null)
    } finally {
      setConfirmBusy(false)
    }
  }

  const choose = async (mangaId: string, title: string) => {
    setSaving(mangaId)
    try {
      await setAdminDailyPuzzle(kind, date, mangaId)
      toast.success(`${KIND_LABEL[kind]} · ${date}: ${title}`)
      setQuery('')
      setResults([])
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? txa(error.message) : txa('Bulmaca seçilemedi.'))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className='grid gap-4 lg:grid-cols-[1fr_360px]' data-testid='admin-games-puzzles'>
      <AdminSurface className='overflow-hidden'>
        <div className='border-b border-border px-4 py-3'>
          <h3 className='text-sm font-semibold'>{txa('Bulmaca takvimi')}</h3>
          <p className='text-xs text-muted-foreground'>{txa('Cevaplar yalnız adminlere görünür.')}</p>
        </div>
        {overview.puzzles.length === 0 ? (
          <p className='p-4 text-sm text-muted-foreground'>{txa('Kayıtlı bulmaca yok.')}</p>
        ) : (
          <table className='w-full text-sm'>
            <thead className='bg-muted/40 text-left text-xs text-muted-foreground'>
              <tr><th className='px-4 py-2 font-medium'>{txa('Gün')}</th><th className='px-4 py-2 font-medium'>{txa('Oyun')}</th><th className='px-4 py-2 font-medium'>{txa('Cevap')}</th><th className='px-4 py-2 text-right font-medium'>{txa('Oynayan')}</th></tr>
            </thead>
            <tbody>
              {overview.puzzles.map((puzzle) => (
                <tr key={`${puzzle.date}:${puzzle.kind}`} className={cn('border-t border-border/60', puzzle.date === overview.today && 'bg-primary/5')}>
                  <td className='px-4 py-2 tabular-nums'>{puzzle.date}{puzzle.date > overview.today && <span className='ml-2 text-[10px] font-semibold text-muted-foreground'>{txa('planlı')}</span>}</td>
                  <td className='px-4 py-2'>{KIND_LABEL[puzzle.kind]}</td>
                  <td className='px-4 py-2 font-medium'>{puzzle.title ?? '—'}</td>
                  <td className='px-4 py-2 text-right tabular-nums'>{puzzle.plays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminSurface>

      <AdminSurface className='space-y-3 p-4'>
        <div>
          <h3 className='text-sm font-semibold'>{txa('Bulmacayı elle seç')}</h3>
          <p className='text-xs text-muted-foreground'>{txa('Bugün ya da ileri bir tarih. Kimse oynamaya başlamadıysa değiştirilebilir.')}</p>
        </div>
        <div className='flex gap-2'>
          {(['cover', 'panel'] as const).map((option) => (
            <Button key={option} type='button' size='sm' variant={kind === option ? 'default' : 'outline'} onClick={() => setKind(option)}>{KIND_LABEL[option]}</Button>
          ))}
        </div>
        <label className='block space-y-1 text-xs font-medium'>
          {txa('Tarih')}
          <Input type='date' value={date} min={overview.today} max={addDays(overview.today, 60)} onChange={(event) => setDate(event.currentTarget.value)} />
        </label>
        <label className='block space-y-1 text-xs font-medium'>
          {txa('Seri')}
          <span className='relative block'>
            <Search className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={txa('Seri ara…')} className='pl-8' data-testid='admin-games-puzzle-search' />
          </span>
        </label>
        {searching && <Loader2 className='size-4 animate-spin text-muted-foreground' />}
        {results.length > 0 && (
          <ul className='max-h-64 space-y-1 overflow-auto'>
            {results.map((manga) => (
              <li key={manga.id}>
                <button type='button' disabled={Boolean(saving)} onClick={() => ask(manga.id, manga.title)} className='flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60'>
                  <span className='truncate'>{manga.title}</span>
                  {saving === manga.id ? <Loader2 className='size-3.5 animate-spin' /> : <span className='text-xs text-primary'>{txa('Seç')}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className='text-[11px] leading-snug text-muted-foreground'>{txa('Panel Avı için serinin gerçek (yer tutucu olmayan) bölüm sayfası olmalı; uygun sayfalardan biri rastgele seçilir.')}</p>
      </AdminSurface>
      <AdminConfirmDialog request={confirm} busy={confirmBusy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm() }} />
    </div>
  )
}
