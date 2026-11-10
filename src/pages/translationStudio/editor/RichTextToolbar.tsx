import type { RefObject } from 'react'
import { TextB, TextItalic, TextTSlash } from '@phosphor-icons/react'
import { hasRichMarkup, stripRichMarkup, toggleWrap } from '@/lib/lettering/rich'
import { txa } from '@/i18n/activeLocale'

/*
 * Per-word text style: makes the selected text in the translation box (the word at the cursor if no selection)
 * bold, italic or colored. Markup stays in the text (**..**, __..__,
 * [#color]..[/]); the editor, published image and reader draw with the same layout engine.
 */

const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#ffffff', '#000000']

/** Secim bossa imlecin uzerindeki kelimeye genisletir. */
function selectionOf(value: string, start: number, end: number) {
  if (start !== end) return { start, end }
  let from = start
  let to = end
  while (from > 0 && !/\s/.test(value[from - 1])) from -= 1
  while (to < value.length && !/\s/.test(value[to])) to += 1
  return { start: from, end: to }
}

export function RichTextToolbar({ textareaRef, value, onChange, disabled }: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const apply = (open: string, close: string) => {
    const area = textareaRef.current
    if (!area) return
    const range = selectionOf(value, area.selectionStart, area.selectionEnd)
    if (range.start === range.end) return
    const next = toggleWrap(value, range.start, range.end, open, close)
    onChange(next.text)
    // The selection is kept: a second style can be added to the same word or undone.
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(next.start, next.end)
    })
  }
  const button = 'flex h-[26px] min-w-[26px] items-center justify-center rounded-[7px] border border-[var(--tl-line)] bg-transparent px-1.5 text-[var(--tl-fg2)] disabled:opacity-40'
  return (
    <div className='flex flex-wrap items-center gap-1' data-testid='tl-rich-toolbar'>
      {/* onMouseDown: dugmeye basinca textarea secimi kaybolmasin. */}
      <button type='button' disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => apply('**', '**')} className={button} title={txa('Kalın (seçili metin ya da imleçteki kelime)')} aria-label={txa('Kalın')} data-testid='tl-rich-bold'>
        <TextB weight='bold' size={13} />
      </button>
      <button type='button' disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => apply('__', '__')} className={button} title={txa('İtalik')} aria-label={txa('İtalik')} data-testid='tl-rich-italic'>
        <TextItalic weight='bold' size={13} />
      </button>
      <span className='mx-0.5 h-4 w-px bg-[var(--tl-line)]' />
      {COLORS.map((color) => (
        <button
          key={color}
          type='button'
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => apply(`[${color}]`, '[/]')}
          className='h-[22px] w-[22px] rounded-full border border-[var(--tl-line)] disabled:opacity-40'
          style={{ background: color }}
          title={`Renk ${color}`}
          aria-label={`Renk ${color}`}
          data-testid='tl-rich-color'
        />
      ))}
      {hasRichMarkup(value) && (
        <button type='button' disabled={disabled} onClick={() => onChange(stripRichMarkup(value))} className={button} title={txa('Kelime stillerini kaldır')} aria-label={txa('Kelime stillerini kaldır')} data-testid='tl-rich-clear'>
          <TextTSlash weight='bold' size={13} />
        </button>
      )}
    </div>
  )
}
