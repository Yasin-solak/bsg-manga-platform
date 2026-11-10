import {
  AlignBottom, AlignCenterHorizontal, AlignCenterVertical, AlignLeft, AlignRight, AlignTop, ArrowsHorizontal, ArrowsVertical,
  CheckCircle, Circle, Minus, Plus, WarningCircle,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { TlPageStatus } from '@/services/translationEditorService'
import type { TlPage } from '@/services/translationStudioService'
import { useRawThumbnail } from '../useRawThumbnail'
import type { AlignMode } from './arrange'
import type { BrushOptions } from './EditorCanvas'
import type { ToolId } from './editorModel'
import { txa } from '@/i18n/activeLocale'

/*
 * Editor bars: page strip, brush / selection / multi-selection option bars.
 */

export function PageStrip({ pages, currentId, statuses, onPick }: {
  pages: TlPage[]
  currentId: string
  statuses: Record<string, TlPageStatus>
  onPick: (index: number) => void
}) {
  return (
    <div className='box-border flex w-[112px] flex-none flex-col gap-2.5 overflow-y-auto border-r border-[var(--tl-line)] bg-[var(--tl-sb)] px-3.5 py-3 [scrollbar-width:none]'>
      {pages.map((page, index) => (
        <StripThumb key={page.id} page={page} index={index} current={page.id === currentId} status={statuses[page.id]} onPick={() => onPick(index)} />
      ))}
    </div>
  )
}

function StripThumb({ page, index, current, status, onPick }: { page: TlPage, index: number, current: boolean, status?: TlPageStatus, onPick: () => void }) {
  const thumb = useRawThumbnail(page.id)
  const done = status && status.total > 0 && status.approved === status.total
  const missing = status && status.missing > 0
  return (
    <button type='button' onClick={onPick} className='relative flex flex-none flex-col gap-[5px] border-0 bg-transparent p-0' aria-current={current ? 'page' : undefined}>
      <span
        className='relative block aspect-[2/3] w-[84px] overflow-hidden rounded-[7px] bg-[var(--tl-fg)]'
        style={{ border: current ? '2px solid var(--tl-p)' : '1px solid var(--tl-line)' }}
      >
        {thumb && <img src={thumb} alt='' className='h-full w-full object-cover' />}
      </span>
      <span className={cn('flex w-[84px] items-center justify-between text-[11.5px] font-bold', current ? 'text-[var(--tl-p)]' : 'text-[var(--tl-fg2)]')}>
        {String(index + 1).padStart(2, '0')}
        {done
          ? <CheckCircle weight='fill' size={13} className='text-[var(--tl-green)]' />
          : missing
            ? <WarningCircle weight='fill' size={13} className='text-[var(--tl-red)]' />
            : <Circle weight='bold' size={13} className='text-[var(--tl-dim)]' />}
      </span>
    </button>
  )
}

function Slider({ id, label, value, min, max, step, format, onChange }: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label htmlFor={id} className='flex flex-none items-center gap-1.5 text-xs font-bold text-[var(--tl-mut)]'>
      {label}
      <input id={id} type='range' min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className='w-[72px] accent-[var(--tl-p)]' />
      <span className='w-[34px] tabular-nums text-[var(--tl-fg2)]'>{format(value)}</span>
    </label>
  )
}

/** Firca araclari: boyut, renk (secici + son renkler), opaklik, sertlik, kalem basinci. */
export function BrushBar({ tool, brush, onBrush, recentColors, onColor }: {
  tool: ToolId
  brush: BrushOptions
  onBrush: (patch: Partial<BrushOptions>) => void
  recentColors: string[]
  onColor: (color: string) => void
}) {
  const swatches = [...new Set(['#ffffff', '#000000', ...recentColors])].slice(0, 8)
  return (
    <div className='flex min-w-0 flex-none items-center gap-3'>
      <div className='flex flex-none items-center gap-1.5'>
        <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Boyut')}</span>
        <MiniStepper value={`${brush.size} px`} onDown={() => onBrush({ size: Math.max(2, brush.size - (brush.size > 40 ? 8 : 2)) })} onUp={() => onBrush({ size: Math.min(300, brush.size + (brush.size >= 40 ? 8 : 2)) })} />
      </div>
      {tool === 'firca' && (
        <div className='flex flex-none items-center gap-1'>
          <input
            id='tl-brush-color'
            type='color'
            value={brush.color}
            title={txa('Renk seç (Alt+tıkla: sayfadan renk al)')}
            onChange={(event) => onColor(event.target.value)}
            className='h-6 w-7 cursor-pointer rounded border border-[var(--tl-line2)] bg-transparent p-0'
          />
          {swatches.map((color) => (
            <button
              key={color}
              type='button'
              title={color}
              aria-label={`Renk ${color}`}
              onClick={() => onColor(color)}
              className='box-border h-5 w-5 rounded p-0'
              style={{ background: color, border: brush.color === color ? '2px solid var(--tl-p)' : '1px solid var(--tl-line2)' }}
            />
          ))}
        </div>
      )}
      {tool !== 'onarim' && tool !== 'silgi' && (
        <Slider id='tl-brush-opacity' label={txa('Opaklık')} value={Math.round(brush.opacity * 100)} min={5} max={100} step={5} format={(value) => `${value}%`} onChange={(value) => onBrush({ opacity: value / 100 })} />
      )}
      {tool !== 'silgi' && (
        <Slider id='tl-brush-hardness' label={txa('Sertlik')} value={Math.round(brush.hardness * 100)} min={0} max={100} step={5} format={(value) => `${value}%`} onChange={(value) => onBrush({ hardness: value / 100 })} />
      )}
      {tool !== 'silgi' && (
        <label htmlFor='tl-brush-pressure' className='flex flex-none items-center gap-1.5 text-xs font-bold text-[var(--tl-mut)]' title={txa('Grafik tablet kaleminin basıncı fırça kalınlığını değiştirir')}>
          <input id='tl-brush-pressure' type='checkbox' checked={brush.pressure} onChange={(event) => onBrush({ pressure: event.target.checked })} className='accent-[var(--tl-p)]' />
          {txa('Basınç')}
        </label>
      )}
    </div>
  )
}

/** Coklu secim: hizala, esit dagit, stili esitle. */
export function AlignBar({ count, onAlign, onMatchStyle }: { count: number, onAlign: (mode: AlignMode) => void, onMatchStyle: () => void }) {
  const button = 'flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border border-[var(--tl-line)] bg-transparent text-[var(--tl-fg2)] hover:text-[var(--tl-fg)] disabled:opacity-40'
  const actions: Array<[AlignMode, string, typeof AlignLeft]> = [
    ['sol', txa('Sola hizala'), AlignLeft], ['yatayOrta', txa('Yatay ortala'), AlignCenterHorizontal], ['sag', txa('Sağa hizala'), AlignRight],
    ['ust', txa('Üste hizala'), AlignTop], ['dikeyOrta', txa('Dikey ortala'), AlignCenterVertical], ['alt', txa('Alta hizala'), AlignBottom],
  ]
  return (
    <div className='flex flex-none items-center gap-1' data-testid='tl-align-bar'>
      <span className='mr-1 whitespace-nowrap text-xs font-bold text-[var(--tl-p)]'>{txa('{v1} öğe', { v1: count })}</span>
      {actions.map(([mode, title, Icon]) => (
        <button key={mode} type='button' title={title} onClick={() => onAlign(mode)} className={button} data-testid={`tl-align-${mode}`}>
          <Icon weight='bold' size={14} />
        </button>
      ))}
      <span className='mx-1 h-[22px] w-px bg-[var(--tl-line)]' />
      <button type='button' title={txa('Yatay eşit dağıt (en az 3 öğe)')} disabled={count < 3} onClick={() => onAlign('yatayDagit')} className={button}><ArrowsHorizontal weight='bold' size={14} /></button>
      <button type='button' title={txa('Dikey eşit dağıt (en az 3 öğe)')} disabled={count < 3} onClick={() => onAlign('dikeyDagit')} className={button}><ArrowsVertical weight='bold' size={14} /></button>
      <span className='mx-1 h-[22px] w-px bg-[var(--tl-line)]' />
      <button type='button' onClick={onMatchStyle} className='h-[30px] flex-none whitespace-nowrap rounded-lg border border-[var(--tl-line)] bg-transparent px-2.5 text-xs font-bold text-[var(--tl-fg2)]' title={txa('Seçili öğenin stilini diğerlerine uygula')}>
        {txa('Stili eşitle')}
      </button>
    </div>
  )
}

/** Selection tools: wand tolerance and actions to apply to the selection. */
export function SelectionBar({ tool, hasSelection, tolerance, onTolerance, fillColor, onApply, onClear }: {
  tool: ToolId
  hasSelection: boolean
  tolerance: number
  onTolerance: (value: number) => void
  fillColor: string
  onApply: (mode: 'onar' | 'doldur' | 'geri') => void
  onClear: () => void
}) {
  const action = 'h-[30px] flex-none whitespace-nowrap rounded-lg border px-2.5 text-xs font-bold disabled:opacity-40'
  return (
    <div className='flex min-w-0 flex-none items-center gap-2' data-testid='tl-selection-bar'>
      {tool === 'degnek' && (
        <Slider id='tl-wand-tolerance' label={txa('Tolerans')} value={tolerance} min={0} max={128} step={2} format={(value) => String(value)} onChange={onTolerance} />
      )}
      <button type='button' disabled={!hasSelection} onClick={() => onApply('onar')} className={cn(action, 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]')} title={txa('Delete veya Enter')}>
        {txa('İçeriğe duyarlı doldur')}
      </button>
      <button type='button' disabled={!hasSelection} onClick={() => onApply('doldur')} className={cn(action, 'flex items-center gap-1.5 border-[var(--tl-line)] bg-transparent text-[var(--tl-fg2)]')}>
        <span className='h-3.5 w-3.5 rounded-sm border border-[var(--tl-line2)]' style={{ background: fillColor }} />
        {txa('Renkle doldur')}
      </button>
      <button type='button' disabled={!hasSelection} onClick={() => onApply('geri')} className={cn(action, 'border-[var(--tl-line)] bg-transparent text-[var(--tl-fg2)]')}>
        {txa('Orijinali geri getir')}
      </button>
      <button type='button' disabled={!hasSelection} onClick={onClear} className={cn(action, 'border-transparent bg-transparent text-[var(--tl-mut)]')} title='Esc'>
        {txa('Seçimi kaldır')}
      </button>
    </div>
  )
}

export function MiniStepper({ value, onDown, onUp }: { value: string, onDown: () => void, onUp: () => void }) {
  return (
    <div className='flex h-[30px] items-center rounded-lg border border-[var(--tl-line)]'>
      <button type='button' onClick={onDown} className='flex h-full w-7 items-center justify-center border-0 bg-transparent text-[var(--tl-fg2)]'><Minus weight='bold' size={11} /></button>
      <span className='w-[54px] text-center text-xs font-bold tabular-nums'>{value}</span>
      <button type='button' onClick={onUp} className='flex h-full w-7 items-center justify-center border-0 bg-transparent text-[var(--tl-fg2)]'><Plus weight='bold' size={11} /></button>
    </div>
  )
}
