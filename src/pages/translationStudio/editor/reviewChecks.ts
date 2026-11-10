import { layoutLettering } from '@/lib/translationLettering'
import { stripRichMarkup } from '@/lib/lettering/rich'
import type { TlGlossaryTerm, TlItem } from '@/services/translationEditorService'
import { txa } from '@/i18n/activeLocale'

/*
 * Bulk review quality check: does the translation fit the area, does it follow glossary terms?
 * The editor and publishing use the same layout engine, so "does not fit" matches the published result.
 */

/**
 * Letter folding for comparison: in Turkish "SAITO".toLocaleLowerCase('tr') produces a dotless
 * i (U+0131); names in shouting (uppercase) balloons would not match the glossary.
 * Dotted/dotless i differences and the combining dot (U+0307) are ignored.
 */
function fold(value: string, lang: string) {
  return value.toLocaleLowerCase(lang).replace(/\u0131/g, 'i').normalize('NFD').replace(/\u0307/g, '')
}

export interface ReviewIssue { kind: 'tasma' | 'sozluk', message: string }

/** Translation quality check: area fit and glossary terms. */
export function reviewIssues(item: TlItem, pageWidth: number, glossary: TlGlossaryTerm[], lang = 'tr'): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  const text = item.text.trim()
  if (!text) return issues
  if (layoutLettering(item, text, pageWidth, lang).layout.overflow) {
    issues.push({ kind: 'tasma', message: txa('Alana sığmıyor') })
  }
  // Kelime stili isaretlemesi (**kalin** vb.) terim eslesmesini bozmaz.
  const lowered = fold(stripRichMarkup(text), lang)
  for (const term of glossary) {
    if (!term.source || !term.target || !item.sourceText.includes(term.source)) continue
    if (!lowered.includes(fold(term.target, lang))) {
      issues.push({ kind: 'sozluk', message: txa('Sözlük: "{v1}" → "{v2}"', { v1: term.source, v2: term.target }) })
    }
  }
  return issues
}
