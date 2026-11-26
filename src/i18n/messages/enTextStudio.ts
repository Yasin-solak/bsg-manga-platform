import { ceviri } from './en/ceviri'
import { ceviri2 } from './en/ceviri2'

/* English texts used only inside the translation studio; loaded with that route (see enText.ts). */
export const enTextStudio: Record<string, string> = { ...ceviri, ...ceviri2 }
