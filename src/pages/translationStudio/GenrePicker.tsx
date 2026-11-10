import { useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react'
import { GENRE_GROUPS, GENRE_CATALOG, MAX_SERIES_GENRES, normalizeGenre, searchGenres } from '@/lib/genreCatalog'
import { getGenreSuggestions, type TlGenreSuggestion } from '@/services/translationStudioService'
import { ChoiceButton } from './studioUi'
import { txa, intlLocale } from '@/i18n/activeLocale'

/*
 * Series draft genre picker: a 130+ genre catalog + genres used on the site (by usage count).
 * A genre not found can be added freely; the admin sees it at approval.
 */
export function GenrePicker({ value, onChange }: { value: string[], onChange: (genres: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [site, setSite] = useState<TlGenreSuggestion[]>([])

  useEffect(() => {
    const controller = new AbortController()
    // If suggestions cannot be fetched the catalog is enough; the picker keeps working.
    getGenreSuggestions(controller.signal).then(setSite).catch(() => setSite([]))
    return () => controller.abort()
  }, [])

  const full = value.length >= MAX_SERIES_GENRES
  const custom = normalizeGenre(query)
  const known = Boolean(custom) && (GENRE_CATALOG.includes(custom) || site.some((entry) => entry.genre === custom))
  // Esanlamli yazim (drama -> Dram) bilinen ture denk geliyorsa o tur basa gelir, "ekle" onerilmez.
  const results = useMemo(() => {
    const found = searchGenres(query, site, query ? 40 : 18)
    return known ? [custom, ...found.filter((genre) => genre !== custom)] : found
  }, [custom, known, query, site])
  const canAddCustom = Boolean(custom) && !known && !value.includes(custom)
  const extraCount = new Set([...site.map((entry) => entry.genre), ...GENRE_CATALOG]).size

  const toggle = (genre: string) => {
    if (value.includes(genre)) onChange(value.filter((item) => item !== genre))
    else if (!full) onChange([...value, genre])
  }
  const add = (genre: string) => {
    const next = normalizeGenre(genre)
    if (next && !value.includes(next) && !full) onChange([...value, next])
    setQuery('')
  }
  const chip = (genre: string) => (
    <ChoiceButton key={genre} active={value.includes(genre)} disabled={!value.includes(genre) && full} onClick={() => toggle(genre)} className='h-8 rounded-full px-[13px] text-[12.5px] disabled:opacity-40'>
      {genre}
    </ChoiceButton>
  )

  return (
    <div className='flex flex-col gap-2.5' data-testid='tl-genre-picker'>
      {value.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {value.map((genre) => (
            <span key={genre} className='flex h-8 items-center gap-1.5 rounded-full border border-[var(--tl-p35)] bg-[var(--tl-p15)] pl-[13px] pr-2 text-[12.5px] font-bold text-[var(--tl-p)]'>
              {genre}
              <button type='button' onClick={() => toggle(genre)} className='flex h-5 w-5 items-center justify-center rounded-full border-0 bg-transparent text-[var(--tl-p)]' aria-label={txa('{v1} kaldır', { v1: genre })}>
                <X weight='bold' size={11} />
              </button>
            </span>
          ))}
          <span className='self-center text-[11.5px] font-semibold text-[var(--tl-dim)]'>{value.length} / {MAX_SERIES_GENRES}</span>
        </div>
      )}
      <label className='flex h-10 items-center gap-2 rounded-[10px] border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 focus-within:border-[var(--tl-p35)]'>
        <MagnifyingGlass weight='bold' size={14} className='text-[var(--tl-mut)]' />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (results[0] && !canAddCustom) toggle(results[0])
            else if (custom) add(custom)
          }}
          placeholder={full ? txa('En fazla {v1} tür seçebilirsin', { v1: MAX_SERIES_GENRES }) : txa('Tür ara ya da yeni tür yaz (ör. Murim, Regresyon)')}
          maxLength={40}
          disabled={full && !query}
          className='min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-[var(--tl-fg)] outline-none'
          data-testid='tl-genre-search'
        />
      </label>
      <div className='flex flex-wrap gap-1.5'>
        {results.map(chip)}
        {canAddCustom && (
          <button type='button' disabled={full} onClick={() => add(custom)} className='flex h-8 items-center gap-1.5 rounded-full border border-dashed border-[var(--tl-p35)] bg-transparent px-[13px] text-[12.5px] font-bold text-[var(--tl-p)] disabled:opacity-40' data-testid='tl-genre-add'>
            <Plus weight='bold' size={12} />
            {txa('“{v1}” türünü ekle', { v1: custom })}
          </button>
        )}
        {query && !results.length && !canAddCustom && <span className='text-[12px] font-semibold text-[var(--tl-dim)]'>{txa('Zaten seçili.')}</span>}
      </div>
      {!query && (
        <button type='button' onClick={() => setShowAll((current) => !current)} className='self-start border-0 bg-transparent p-0 text-[12px] font-bold text-[var(--tl-p)]'>
          {showAll ? txa('Tüm türleri gizle') : txa('Tüm türler ({v1})', { v1: extraCount })}
        </button>
      )}
      {!query && showAll && (
        <div className='flex max-h-[320px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--tl-line)] p-3'>
          {GENRE_GROUPS.map((group) => (
            <div key={group.title} className='flex flex-col gap-1.5'>
              <span className='text-[11.5px] font-bold tracking-[0.04em] text-[var(--tl-dim)]'>{txa(group.title).toLocaleUpperCase(intlLocale())}</span>
              <div className='flex flex-wrap gap-1.5'>{group.genres.map(chip)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
