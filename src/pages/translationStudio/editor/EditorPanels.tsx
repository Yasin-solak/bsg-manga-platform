import { useEffect, useRef, useState } from 'react'
import {
  ArrowsClockwise, BookOpen, Check, CheckCircle, CursorClick, Eye, EyeSlash, LockSimple, LockSimpleOpen, Minus, Plus, Sparkle, TextAlignCenter, TextAlignLeft,
  TextAlignRight, TextItalic, Trash, X,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { stripRichMarkup } from '@/lib/lettering/rich'
import { customFontKey } from '@/lib/customFonts'
import type { TlCustomFont, TlGlossaryTerm, TlItem, TlStyle, TlStylePreset, TlSuggestion } from '@/services/translationEditorService'
import type { TlItemType } from '@/services/translationStudioService'
import { FULL_STUDIO_ACCESS, type StudioAccess } from '../studioAccess'
import { RichTextToolbar } from './RichTextToolbar'
import {
  BLACK, contrastOf, FONTS, fontOf, matchesFilter, resolveStyle, STATUS_META, TYPE_META, WHITE, type FontKey, type ItemFilter,
} from './editorModel'
import { txa } from '@/i18n/activeLocale'

const FILTERS: Array<{ key: ItemFilter, label: string }> = [
  { key: 'hepsi', get label() { return txa('Tümü') } },
  { key: 'eksik', get label() { return txa('Eksik') } },
  { key: 'oneri', get label() { return txa('Öneri') } },
  { key: 'onayli', get label() { return txa('Onaylı') } },
]

export function ItemList({ items, allItems, pageLabel, filter, onFilter, selectedId, selectedIds, onSelect, overflowIds, hiddenIds, lockedIds, onToggleHidden, onToggleLocked }: {
  overflowIds: Set<string>
  items: TlItem[]
  allItems: TlItem[]
  pageLabel: string
  filter: ItemFilter
  onFilter: (filter: ItemFilter) => void
  selectedId: string | null
  selectedIds: string[]
  onSelect: (id: string, mode?: 'toggle') => void
  /** Layers: a hidden item's text is not drawn in the editor (no effect on publishing); a locked item cannot move on the canvas. */
  hiddenIds: Set<string>
  lockedIds: Set<string>
  onToggleHidden: (id: string) => void
  onToggleLocked: (id: string) => void
}) {
  return (
    <div className='flex w-[300px] flex-none flex-col border-l border-[var(--tl-line)] bg-[var(--tl-sb)]'>
      <div className='flex flex-none flex-col gap-3 border-b border-[var(--tl-line)] px-4 pb-3 pt-4'>
        <div className='flex items-center justify-between'>
          <span className='text-lg font-bold tracking-[0.02em]'>{txa('ÖĞELER')}</span>
          <span className='text-xs font-semibold text-[var(--tl-mut)]'>{pageLabel}</span>
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {FILTERS.map((entry) => {
            const active = entry.key === filter
            return (
              <button
                key={entry.key}
                type='button'
                onClick={() => onFilter(entry.key)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold',
                  active ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)]',
                )}
              >
                {entry.label}
                <span className='text-[11px] opacity-75'>{allItems.filter((item) => matchesFilter(item, entry.key)).length}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2'>
        {items.length === 0 && (
          <span className='p-4 text-center text-[12.5px] font-semibold text-[var(--tl-dim)]'>
            {allItems.length === 0 ? txa('Bu sayfada alan yok. "Alan çiz" (M) ile ekleyebilirsin.') : txa('Bu filtrede öğe yok.')}
          </span>
        )}
        {items.map((item) => {
          const selected = item.id === selectedId || selectedIds.includes(item.id)
          const status = STATUS_META[item.status]
          const hidden = hiddenIds.has(item.id)
          const locked = lockedIds.has(item.id)
          const layerButton = 'flex h-6 w-6 items-center justify-center rounded-md border-0 bg-transparent hover:bg-[var(--tl-acc2)]'
          return (
            <div key={item.id} className='group relative'>
            <button
              type='button'
              onClick={(event) => onSelect(item.id, event.shiftKey ? 'toggle' : undefined)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-[10px] border p-2.5 pr-9 text-left text-[var(--tl-fg)]',
                selected ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)]' : 'border-transparent bg-transparent hover:bg-[var(--tl-card)]',
                hidden && 'opacity-55',
              )}
            >
              <span className='flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md bg-[var(--tl-acc2)] text-[11px] font-extrabold'>
                {allItems.indexOf(item) + 1}
              </span>
              <span className='flex min-w-0 flex-1 flex-col gap-1'>
                <span className='flex items-center justify-between gap-2'>
                  <span className='flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--tl-mut)]'>
                    {TYPE_META[item.type].label}
                    {overflowIds.has(item.id) && <span className='rounded-full bg-[var(--tl-red)]/15 px-1.5 text-[10.5px] text-[var(--tl-red)]'>{txa('Sığmıyor')}</span>}
                  </span>
                  <span className='flex items-center gap-[5px] text-[11.5px] font-bold' style={{ color: status.color }}>
                    <span className='h-1.5 w-1.5 rounded-full' style={{ background: status.color }} />
                    {status.label}
                  </span>
                </span>
                <span className='truncate text-[12.5px] text-[var(--tl-fg2)]'>{item.sourceText || '—'}</span>
                <span className={cn('truncate text-[13px] font-semibold', item.text ? 'text-[var(--tl-fg)]' : 'text-[var(--tl-red)]')}>
                  {stripRichMarkup(item.text) || txa('Çeviri yok')}
                </span>
              </span>
            </button>
            <span className={cn('absolute right-1.5 top-1.5 flex flex-col gap-0.5 transition-opacity', hidden || locked ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100')}>
              <button type='button' onClick={() => onToggleHidden(item.id)} className={cn(layerButton, hidden ? 'text-[var(--tl-amber)]' : 'text-[var(--tl-mut)]')} title={hidden ? txa('Yazıyı göster') : txa('Yazıyı editörde gizle (yayına etkisi yok)')} aria-pressed={hidden} data-testid='tl-layer-hide'>
                {hidden ? <EyeSlash weight='bold' size={12} /> : <Eye weight='bold' size={12} />}
              </button>
              <button type='button' onClick={() => onToggleLocked(item.id)} className={cn(layerButton, locked ? 'text-[var(--tl-amber)]' : 'text-[var(--tl-mut)]')} title={locked ? txa('Kilidi aç') : txa('Kilitle (tuvalde taşınmaz)')} aria-pressed={locked} data-testid='tl-layer-lock'>
                {locked ? <LockSimple weight='bold' size={12} /> : <LockSimpleOpen weight='bold' size={12} />}
              </button>
            </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stepper({ label, value, onDown, onUp }: { label: string, value: string, onDown: () => void, onUp: () => void }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-xs font-bold text-[var(--tl-mut)]'>{label}</span>
      <div className='flex h-[30px] items-center rounded-lg border border-[var(--tl-line)]'>
        <button type='button' onClick={onDown} className='flex h-full w-7 items-center justify-center border-0 bg-transparent text-[var(--tl-fg2)]' aria-label={`${label} azalt`}>
          <Minus weight='bold' size={11} />
        </button>
        <span className='flex-1 text-center text-xs font-bold tabular-nums'>{value}</span>
        <button type='button' onClick={onUp} className='flex h-full w-7 items-center justify-center border-0 bg-transparent text-[var(--tl-fg2)]' aria-label={txa('{v1} arttır', { v1: label })}>
          <Plus weight='bold' size={11} />
        </button>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, unit = '', onChange, testId }: { label: string, value: number, min: number, max: number, unit?: string, onChange: (value: number) => void, testId?: string }) {
  return (
    <label className='flex items-center gap-2 text-xs font-bold text-[var(--tl-mut)]'>
      <span className='w-[62px] flex-none'>{label}</span>
      <input
        type='range'
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className='min-w-0 flex-1 accent-[var(--tl-p)]'
        data-testid={testId}
      />
      <span className='w-10 flex-none text-right tabular-nums text-[var(--tl-fg2)]'>{value}{unit}</span>
    </label>
  )
}

function ColorInput({ value, onChange, title }: { value: string, onChange: (value: string) => void, title: string }) {
  return (
    <input
      type='color'
      title={title}
      aria-label={title}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      className='h-7 w-7 flex-none cursor-pointer rounded-[7px] border border-[var(--tl-line2)] bg-transparent p-0.5'
    />
  )
}

function Seg({ active, onClick, className, children, title }: { active: boolean, onClick: () => void, className?: string, children: React.ReactNode, title?: string }) {
  return (
    <button
      type='button'
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'border font-bold transition-colors',
        active ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)] hover:text-[var(--tl-fg2)]',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Inspector(props: {
  item: TlItem | null
  /** Text does not fit the area even at the smallest size. */
  overflow: boolean
  index: number
  sourceLanguageCode: string
  pageWidth: number
  suggestions: TlSuggestion[]
  glossary: TlGlossaryTerm[]
  rereading: boolean
  onType: (type: TlItemType) => void
  access?: StudioAccess
  /** Another person editing this item at the same time (presence). */
  peerOnItem?: string | null
  onSourceText: (text: string) => void
  onReread: () => void
  onText: (text: string) => void
  onStyle: (style: TlStyle, snapshot: boolean) => void
  onCleanup: (cleanup: 'beyaz' | 'onarim') => void
  onDelete: () => void
  onApprove: () => void
  onUnapprove: () => void
  onFocusField: () => void
  customFonts: TlCustomFont[]
  stylePresets: TlStylePreset[]
  onSavePreset: (name: string) => void
  onApplyPreset: (presetId: string) => void
  onDeletePreset: (presetId: string) => void
  uploadingFont: boolean
  onUploadFont: (file: File) => void
}) {
  const { item, index, sourceLanguageCode, pageWidth, suggestions, glossary, rereading } = props
  const access = props.access ?? FULL_STUDIO_ACCESS
  const [source, setSource] = useState(item?.sourceText ?? '')
  const [text, setTextState] = useState(item?.text ?? '')
  const textRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setSource(item?.sourceText ?? '') }, [item?.id, item?.sourceText])
  useEffect(() => { setTextState(item?.text ?? '') }, [item?.id, item?.text])
  // A slider / color picker sends continuous values: consecutive style changes within 700 ms
  // become one undo step (no separate step per pixel).
  const lastStyleEdit = useRef(0)
  const [presetName, setPresetName] = useState<string | null>(null)

  if (!item) {
    return (
      <div className='flex w-[400px] flex-none flex-col items-center justify-center gap-2.5 border-l border-[var(--tl-line)] bg-[var(--tl-card)] p-8 text-center text-[var(--tl-mut)]'>
        <CursorClick weight='bold' size={28} />
        <span className='text-[13px] font-semibold'>{txa('İncelemek için sayfada ya da listede bir öğe seç.')}</span>
      </div>
    )
  }

  const status = STATUS_META[item.status]
  const style = resolveStyle(item, pageWidth)
  const setStyle = (patch: Partial<TlStyle>) => {
    const now = performance.now()
    const snapshot = now - lastStyleEdit.current > 700
    lastStyleEdit.current = now
    props.onStyle({ ...item.style, ...patch }, snapshot)
  }
  const confidence = item.ocrConfidence
  const confidenceLabel = item.sourceOrigin === 'manual' || confidence === null ? txa('Elle girildi') : txa('OCR güveni %{v1}', { v1: Math.round(confidence * 100) })
  const confidenceColor = confidence !== null && confidence < 0.8 && item.sourceOrigin === 'ocr' ? 'var(--tl-amber)' : 'var(--tl-mut)'
  const itemSuggestions = suggestions.filter((entry) => entry.itemId === item.id).sort((a, b) => a.rank - b.rank)
  const matchedGlossary = glossary.filter((term) => term.source && item.sourceText.includes(term.source)).slice(0, 4)
  const suggestedFont = item.fontSuggestion && item.fontSuggestion.font in FONTS ? item.fontSuggestion : null
  const fontApplied = suggestedFont ? style.font === suggestedFont.font && style.size === suggestedFont.size : false

  return (
    <div className='flex w-[400px] flex-none flex-col border-l border-[var(--tl-line)] bg-[var(--tl-card)]' data-testid='tl-inspector'>
      <div className='flex flex-none items-center gap-2.5 border-b border-[var(--tl-line)] px-4 py-3.5'>
        <span className='flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--tl-acc2)] text-[12.5px] font-extrabold'>{index + 1}</span>
        <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <span className='text-sm font-bold'>{TYPE_META[item.type].label}</span>
          <span className='text-[11.5px] font-semibold tabular-nums text-[var(--tl-mut)]'>x {item.x} · y {item.y} · {item.w}×{item.h}</span>
        </div>
        <span className='flex h-6 items-center gap-1.5 rounded-full border border-[var(--tl-line)] px-[9px] text-[11.5px] font-bold' style={{ color: status.color }}>
          <span className='h-1.5 w-1.5 rounded-full' style={{ background: status.color }} />
          {status.label}
        </span>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4'>
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Metin türü')}</span>
            <span className='text-[11.5px] font-semibold text-[var(--tl-dim)]'>{txa('Etiket · görünümü değiştirmez')}</span>
          </div>
          <fieldset disabled={!access.layout} className='grid grid-cols-4 gap-[5px] disabled:opacity-60'>
            {(Object.keys(TYPE_META) as TlItemType[]).map((type) => (
              <Seg key={type} active={item.type === type} onClick={() => props.onType(type)} className='h-[30px] rounded-lg text-xs'>
                {TYPE_META[type].label}
              </Seg>
            ))}
          </fieldset>
        </div>

        {props.peerOnItem && (
          <span className='rounded-lg bg-[var(--tl-amber)]/15 px-3 py-2 text-[12px] font-semibold text-[var(--tl-amber)]' data-testid='tl-peer-warning'>
            {txa('{v1} bu öğeyi şu anda düzenliyor; değişiklikleriniz çakışabilir.', { v1: props.peerOnItem })}
          </span>
        )}

        <fieldset disabled={!(access.text || access.layout)} className='flex flex-col gap-2 disabled:opacity-60'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Orijinal · {v1}', { v1: sourceLanguageCode })}</span>
            <span className='text-[11.5px] font-semibold' style={{ color: confidenceColor }}>{confidenceLabel}</span>
          </div>
          <textarea
            value={source}
            rows={2}
            placeholder={txa('Orijinal metni yaz')}
            onFocus={props.onFocusField}
            onChange={(event) => setSource(event.target.value)}
            onBlur={() => { if (source !== item.sourceText) props.onSourceText(source) }}
            className='resize-none rounded-[10px] border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2.5 text-[15px] leading-normal text-[var(--tl-fg)] outline-none focus:border-[var(--tl-p35)]'
          />
          <button
            type='button'
            onClick={props.onReread}
            disabled={rereading || !access.ai}
            title={access.ai ? undefined : txa('+18 seride yapay zekâ kapalı')}
            className='flex h-7 items-center gap-1.5 self-start rounded-lg border border-[var(--tl-line)] bg-transparent px-2.5 text-xs font-bold text-[var(--tl-fg2)] disabled:opacity-50'
          >
            <ArrowsClockwise weight='bold' size={12} className={rereading ? 'animate-spin' : ''} />
            {rereading ? txa('Okunuyor…') : txa('Bu alanı yeniden oku')}
          </button>
        </fieldset>

        {(itemSuggestions.length > 0 || suggestedFont || matchedGlossary.length > 0) && (
          <fieldset disabled={!access.text} className='flex flex-col gap-[9px] rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg)] p-3'>
            <span className='flex items-center gap-1.5 text-xs font-bold text-[var(--tl-mut)]'>
              <Sparkle weight='fill' size={13} className='text-[var(--tl-p)]' />
              {txa('Öneri')}
            </span>
            {itemSuggestions.map((entry) => {
              const used = entry.text === item.text
              return (
                <div key={`${entry.rank}-${entry.text}`} className='flex items-center gap-2.5'>
                  <span className='min-w-0 flex-1 text-[13.5px] font-semibold' title={`${entry.provider} · ${entry.model}`}>{entry.text}</span>
                  <button
                    type='button'
                    onClick={() => props.onText(entry.text)}
                    className={cn(
                      'h-[26px] flex-none rounded-[7px] border bg-transparent px-2.5 text-[11.5px] font-bold',
                      used ? 'border-[var(--tl-p35)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] text-[var(--tl-fg2)]',
                    )}
                  >
                    {used ? txa('Kullanılıyor') : txa('Kullan')}
                  </button>
                </div>
              )
            })}
            {suggestedFont && (
              <div className='flex items-center gap-2.5 border-t border-[var(--tl-line)] pt-2.5'>
                <span
                  className='flex h-[38px] w-[46px] flex-none items-center justify-center rounded-lg bg-[var(--tl-fg)] text-[19px] text-[var(--tl-bg)]'
                  style={{ fontFamily: fontOf(suggestedFont.font).family, fontWeight: fontOf(suggestedFont.font).weight }}
                >
                  {txa('Aa')}
                </span>
                <span className='flex min-w-0 flex-1 flex-col gap-[3px]'>
                  <span className='text-[13px] font-bold'>{txa('{v1} · {v2} px', { v1: fontOf(suggestedFont.font).name, v2: suggestedFont.size })}</span>
                  <span className='text-[11.5px] font-semibold text-[var(--tl-mut)]'>{suggestedFont.reason || fontOf(suggestedFont.font).desc}</span>
                </span>
                <button
                  type='button'
                  onClick={() => setStyle({ font: suggestedFont.font, size: suggestedFont.size })}
                  className={cn(
                    'h-[26px] flex-none rounded-[7px] border bg-transparent px-2.5 text-[11.5px] font-bold',
                    fontApplied ? 'border-[var(--tl-p35)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] text-[var(--tl-fg2)]',
                  )}
                >
                  {fontApplied ? txa('Uygulandı') : txa('Uygula')}
                </button>
              </div>
            )}
            {matchedGlossary.map((term) => (
              <span key={term.source} className='flex items-center gap-1.5 border-t border-[var(--tl-line)] pt-[9px] text-xs font-semibold text-[var(--tl-mut)]'>
                <BookOpen weight='bold' size={12} />
                {txa('Sözlük:')} <span className='text-[var(--tl-fg2)]'>{term.source}</span> → <span className='text-[var(--tl-fg2)]'>{term.target}</span>
              </span>
            ))}
          </fieldset>
        )}

        <fieldset disabled={!access.text} className='flex flex-col gap-2 disabled:opacity-60'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Çeviri · TR')}</span>
            <RichTextToolbar textareaRef={textRef} value={text} disabled={!access.text} onChange={(next) => { setTextState(next); props.onText(next) }} />
          </div>
          <textarea
            ref={textRef}
            value={text}
            rows={3}
            placeholder={txa('Türkçe çeviriyi yaz')}
            onFocus={props.onFocusField}
            onChange={(event) => { setTextState(event.target.value); props.onText(event.target.value) }}
            className='resize-none rounded-[10px] border border-[var(--tl-p35)] bg-[var(--tl-bg)] px-3 py-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--tl-fg)] outline-none'
            data-testid='tl-inspector-text'
          />
          {props.overflow && (
            <span className='text-[12px] font-semibold text-[var(--tl-red)]' data-testid='tl-overflow-warning'>
              {txa('Metin en küçük boyutta bile alana sığmıyor: alanı büyüt, metni kısalt ya da yazı boyutunu elle küçült.')}
            </span>
          )}
        </fieldset>

        <fieldset disabled={!access.layout} className='flex flex-col gap-2.5 border-t border-[var(--tl-line)] pt-4 disabled:opacity-60'>
          <div className='flex items-center justify-between'>
            <span className='text-[13px] font-bold tracking-[0.04em]'>{txa('YAZI')}</span>
            <label className={cn('flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-[var(--tl-line)] px-[9px] text-[11.5px] font-bold text-[var(--tl-fg2)]', props.uploadingFont && 'opacity-50')}>
              <Plus weight='bold' size={11} />
              {props.uploadingFont ? txa('Yükleniyor…') : txa('Font yükle')}
              <input
                type='file'
                accept='.ttf,.otf,.woff2,font/ttf,font/otf,font/woff2'
                className='hidden'
                disabled={props.uploadingFont || !access.resources}
                onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onUploadFont(file); event.target.value = '' }}
              />
            </label>
          </div>
          <div className='flex flex-col gap-1.5' data-testid='tl-style-presets'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Ekip stilleri')}</span>
              {presetName === null && (
                <button type='button' disabled={!access.resources} onClick={() => setPresetName('')} className='flex h-[24px] items-center gap-1 rounded-[7px] border border-[var(--tl-line)] bg-transparent px-2 text-[11px] font-bold text-[var(--tl-fg2)]' title={txa('Bu öğenin stilini ekip kütüphanesine kaydet')}>
                  <Plus weight='bold' size={10} />
                  {txa('Stili kaydet')}
                </button>
              )}
            </div>
            {presetName !== null && (
              <form
                className='flex gap-1.5'
                onSubmit={(event) => { event.preventDefault(); if (presetName.trim()) { props.onSavePreset(presetName); setPresetName(null) } }}
              >
                <input
                  autoFocus
                  value={presetName}
                  maxLength={40}
                  onChange={(event) => setPresetName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Escape') setPresetName(null) }}
                  placeholder={txa('Örn. Bağırma · kırmızı kontur')}
                  className='h-8 min-w-0 flex-1 rounded-lg border border-[var(--tl-line)] bg-transparent px-2.5 text-xs text-[var(--tl-fg)] outline-none focus:border-[var(--tl-p35)]'
                  data-testid='tl-preset-name'
                />
                <button type='submit' disabled={!presetName.trim()} className='h-8 rounded-lg border-0 bg-[var(--tl-p)] px-3 text-xs font-extrabold text-[var(--tl-pfg)] disabled:opacity-45'>{txa('Kaydet')}</button>
                <button type='button' onClick={() => setPresetName(null)} className='h-8 rounded-lg border border-[var(--tl-line)] bg-transparent px-2.5 text-xs font-bold text-[var(--tl-mut)]'>{txa('Vazgeç')}</button>
              </form>
            )}
            {props.stylePresets.length > 0 ? (
              <div className='flex flex-wrap gap-1.5'>
                {props.stylePresets.map((preset) => {
                  const font = fontOf(preset.style.font)
                  return (
                    <span key={preset.id} className='group flex h-8 items-center rounded-lg border border-[var(--tl-line)]'>
                      <button
                        type='button'
                        onClick={() => props.onApplyPreset(preset.id)}
                        className='h-full max-w-[180px] truncate border-0 bg-transparent pl-2.5 pr-1.5 text-[13px] text-[var(--tl-fg)]'
                        style={{ fontFamily: font.family, fontWeight: font.weight }}
                        title={txa('"{v1}" stilini uygula', { v1: preset.name })}
                        data-testid='tl-preset'
                      >
                        {preset.name}
                      </button>
                      <button
                        type='button'
                        disabled={!access.resources}
                        onClick={() => props.onDeletePreset(preset.id)}
                        className='flex h-full w-6 items-center justify-center border-0 bg-transparent text-[var(--tl-mut)] opacity-0 transition-opacity hover:text-[var(--tl-red)] focus-visible:opacity-100 group-hover:opacity-100'
                        aria-label={txa('"{v1}" stilini sil', { v1: preset.name })}
                        title={txa('Ekip stilini sil')}
                      >
                        <X weight='bold' size={10} />
                      </button>
                    </span>
                  )
                })}
              </div>
            ) : presetName === null && (
              <span className='text-[11.5px] text-[var(--tl-mut)]'>{txa('Beğendiğin stili kaydet; ekibin tüm bölümlerde tek tıkla kullansın.')}</span>
            )}
          </div>
          <div className='grid grid-cols-2 gap-1.5'>
            {[...(Object.keys(FONTS) as FontKey[]), ...props.customFonts.map((entry) => customFontKey(entry.id))].map((key) => {
              const font = fontOf(key)
              const active = style.font === key
              return (
                <button
                  key={key}
                  type='button'
                  onClick={() => setStyle({ font: key })}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-[9px] border px-2.5 py-2 text-left text-[var(--tl-fg)]',
                    active ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)]' : 'border-[var(--tl-line)] bg-transparent',
                  )}
                >
                  <span className='whitespace-nowrap text-base leading-tight' style={{ fontFamily: font.family, fontWeight: font.weight }}>{font.name}</span>
                  <span className={cn('text-[11px] font-semibold', active ? 'text-[var(--tl-p)]' : 'text-[var(--tl-mut)]')}>{font.desc}</span>
                </button>
              )
            })}
          </div>
          <div className='grid grid-cols-3 gap-2'>
            <Stepper label={txa('Boyut')} value={`${style.size} px`} onDown={() => setStyle({ size: Math.max(4, style.size - 1) })} onUp={() => setStyle({ size: Math.min(400, style.size + 1) })} />
            <Stepper label={txa('Satır')} value={style.lineHeight.toFixed(2)} onDown={() => setStyle({ lineHeight: Math.max(0.5, Number((style.lineHeight - 0.04).toFixed(2))) })} onUp={() => setStyle({ lineHeight: Math.min(3, Number((style.lineHeight + 0.04).toFixed(2))) })} />
            <Stepper label={txa('Harf aralığı')} value={style.letterSpacing.toFixed(2)} onDown={() => setStyle({ letterSpacing: Math.max(-20, Number((style.letterSpacing - 0.02).toFixed(2))) })} onUp={() => setStyle({ letterSpacing: Math.min(50, Number((style.letterSpacing + 0.02).toFixed(2))) })} />
          </div>
          <div className='flex items-center gap-2'>
            <div className='flex gap-[3px]'>
              {([['left', TextAlignLeft], ['center', TextAlignCenter], ['right', TextAlignRight]] as const).map(([align, Icon]) => (
                <Seg key={align} active={style.align === align} onClick={() => setStyle({ align })} className='flex h-8 w-8 items-center justify-center rounded-lg' title={txa('Hizala')}>
                  <Icon weight='bold' size={14} />
                </Seg>
              ))}
            </div>
            <span className='h-[22px] w-px bg-[var(--tl-line)]' />
            {([[BLACK, txa('Siyah')], [WHITE, txa('Beyaz')]] as const).map(([color, label]) => (
              <button
                key={color}
                type='button'
                title={label}
                onClick={() => setStyle({ color })}
                className='box-border h-7 w-7 rounded-[7px] p-0'
                style={{ background: color, border: style.color.toLowerCase() === color ? '2px solid var(--tl-p)' : '1px solid var(--tl-line2)' }}
              />
            ))}
            <span className='h-[22px] w-px bg-[var(--tl-line)]' />
            <Seg active={style.stroke} onClick={() => setStyle({ stroke: !style.stroke })} className='h-8 rounded-lg px-2.5 text-xs' title={txa('Kontur')}>{txa('Kontur')}</Seg>
            <Seg active={style.italic} onClick={() => setStyle({ italic: !style.italic })} className='flex h-8 w-8 items-center justify-center rounded-lg' title={txa('İtalik')}>
              <TextItalic weight='bold' size={14} />
            </Seg>
          </div>
        </fieldset>

        <fieldset disabled={!access.layout} className='flex flex-col gap-2.5 border-t border-[var(--tl-line)] pt-4 disabled:opacity-60' data-testid='tl-effects'>
          <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Efektler')}</span>
          <div className='flex items-center gap-2'>
            <span className='w-[62px] flex-none text-xs font-bold text-[var(--tl-mut)]'>{txa('Dolgu')}</span>
            <ColorInput title={txa('Yazı rengi')} value={style.color} onChange={(color) => setStyle({ color })} />
            <Seg active={style.color2 !== null} onClick={() => setStyle({ color2: style.color2 === null ? contrastOf(style.color) : undefined })} className='h-7 rounded-lg px-2.5 text-xs' title={txa('Üstten alta renk geçişi')}>{txa('Geçiş')}</Seg>
            {style.color2 !== null && <ColorInput title={txa('Geçişin alt rengi')} value={style.color2} onChange={(color2) => setStyle({ color2 })} />}
          </div>
          <div className='flex items-center gap-2'>
            <span className='w-[62px] flex-none text-xs font-bold text-[var(--tl-mut)]'>{txa('Kontur')}</span>
            <ColorInput title={txa('Kontur rengi')} value={style.strokeColor} onChange={(strokeColor) => setStyle({ strokeColor, stroke: true })} />
            <div className='min-w-0 flex-1'>
              <Slider label={txa('Kalınlık')} value={style.stroke ? style.strokeWidth : 0} min={0} max={40} unit='%' onChange={(strokeWidth) => setStyle(strokeWidth > 0 ? { stroke: true, strokeWidth } : { stroke: false })} testId='tl-stroke-width' />
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <span className='w-[62px] flex-none text-xs font-bold text-[var(--tl-mut)]'>{txa('Gölge')}</span>
            <Seg active={style.shadow && (style.shadowX !== 0 || style.shadowY !== 0)} onClick={() => setStyle(style.shadow && (style.shadowX || style.shadowY) ? { shadow: false } : { shadow: true, shadowX: 6, shadowY: 8, shadowBlur: 12, shadowColor: BLACK })} className='h-7 rounded-lg px-2.5 text-xs' title={txa('Alt sağa düşen gölge')}>{txa('Gölge')}</Seg>
            <Seg active={style.shadow && style.shadowX === 0 && style.shadowY === 0} onClick={() => setStyle(style.shadow && !style.shadowX && !style.shadowY ? { shadow: false } : { shadow: true, shadowX: 0, shadowY: 0, shadowBlur: 35, shadowColor: contrastOf(style.color) })} className='h-7 rounded-lg px-2.5 text-xs' title={txa('Yazının çevresinde parlama')}>{txa('Parlama')}</Seg>
            {style.shadow && <ColorInput title={txa('Gölge rengi')} value={style.shadowColor} onChange={(shadowColor) => setStyle({ shadowColor })} />}
          </div>
          {style.shadow && (
            <div className='flex flex-col gap-1.5 pl-[70px]'>
              <Slider label={txa('Yumuşaklık')} value={style.shadowBlur} min={0} max={100} unit='%' onChange={(shadowBlur) => setStyle({ shadowBlur })} />
              <Slider label={txa('Yatay')} value={style.shadowX} min={-50} max={50} onChange={(shadowX) => setStyle({ shadowX })} />
              <Slider label={txa('Dikey')} value={style.shadowY} min={-50} max={50} onChange={(shadowY) => setStyle({ shadowY })} />
            </div>
          )}
          <div className='flex items-center gap-2'>
            <div className='min-w-0 flex-1'>
              <Slider label={txa('Kavis')} value={style.bend} min={-100} max={100} onChange={(bend) => setStyle({ bend: bend || undefined })} testId='tl-bend' />
            </div>
            {style.bend !== 0 && (
              <button type='button' onClick={() => setStyle({ bend: undefined })} className='h-7 rounded-lg border border-[var(--tl-line)] bg-transparent px-2 text-[11px] font-bold text-[var(--tl-mut)]' title={txa('Kavisi sıfırla')}>{txa('Düz')}</button>
            )}
          </div>
        </fieldset>

        <fieldset disabled={!(access.clean || access.layout)} className='flex flex-col gap-2 border-t border-[var(--tl-line)] pt-4 disabled:opacity-60'>
          <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Temizleme')}</span>
          <div className='flex gap-1'>
            <Seg active={item.cleanup === 'beyaz'} onClick={() => props.onCleanup('beyaz')} className='h-8 flex-1 rounded-[9px] text-xs'>{txa('Beyaz dolgu')}</Seg>
            <Seg active={item.cleanup === 'onarim'} onClick={() => props.onCleanup('onarim')} className='h-8 flex-1 rounded-[9px] text-xs'>{txa('Onarım')}</Seg>
          </div>
        </fieldset>
      </div>

      <div className='flex flex-none gap-2 border-t border-[var(--tl-line)] px-4 py-3.5'>
        <button
          type='button'
          onClick={props.onDelete}
          disabled={!access.layout}
          title={txa('Alanı sil (Delete)')}
          className='flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)] hover:border-[var(--tl-red)] hover:text-[var(--tl-red)]'
        >
          <Trash weight='bold' size={15} />
        </button>
        {item.status === 'onayli' ? (
          <button
            type='button'
            onClick={props.onUnapprove}
            disabled={!access.text}
            className='flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border border-[var(--tl-line)] bg-transparent text-[13px] font-bold text-[var(--tl-fg2)]'
          >
            <CheckCircle weight='fill' size={15} className='text-[var(--tl-green)]' />
            {txa('Onaylı · geri al')}
          </button>
        ) : (
          <button
            type='button'
            onClick={props.onApprove}
            disabled={!item.text.trim() || !access.text}
            className='flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border-0 bg-[var(--tl-p)] text-[13px] font-extrabold text-[var(--tl-pfg)] disabled:opacity-45'
            data-testid='tl-approve'
          >
            <Check weight='bold' size={14} />
            {txa('Onayla ve sonrakine geç')}
          </button>
        )}
      </div>
    </div>
  )
}
