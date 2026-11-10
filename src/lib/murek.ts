import type { MurekMood } from '@/components/murek/Murek'
import { txa } from '@/i18n/activeLocale'

/*
 * Feed Mürek: not a separate game but the face of daily quests. Each claimed daily quest
 * feeds Mürek a bit; when all are done it is "full". Coins still come from the quest (no double reward).
 */
export interface MurekFeedState {
  mood: MurekMood
  title: string
  description: string
  ratio: number
}

export function resolveMurekFeedState(done: number, total: number): MurekFeedState | null {
  const safeTotal = Math.max(0, Math.floor(total))
  if (safeTotal === 0) return null
  const safeDone = Math.min(safeTotal, Math.max(0, Math.floor(done)))
  const ratio = safeDone / safeTotal
  if (safeDone === 0) {
    return { mood: 'hungry', title: txa('Mürek aç'), description: txa('Günlük görevleri bitirdikçe Mürek doyar.'), ratio }
  }
  if (safeDone < safeTotal) {
    return { mood: 'idle', title: txa('Mürek atıştırdı'), description: txa('{v1} görev daha, Mürek doysun.', { v1: safeTotal - safeDone }), ratio }
  }
  return { mood: 'full', title: txa('Mürek tok!'), description: txa('Bugünkü tüm görevleri bitirdin.'), ratio }
}

/** Today's Cover: reward by which guess got it right (same as the server table). */
export const DAILY_COVER_REWARDS = [20, 15, 12, 9, 6, 4] as const

export function dailyCoverRewardFor(guessNumber: number): number {
  return DAILY_COVER_REWARDS[guessNumber - 1] ?? 0
}

/** Shareable result line: "Today's Cover 2026-10-04 · 3/6 🟥🟥🟩". */
export function buildDailyGameShareText(input: { date: string, guesses: Array<{ correct: boolean }>, maxGuesses: number, solved: boolean, title?: string }) {
  const marks = input.guesses.map((guess) => (guess.correct ? '🟩' : '🟥')).join('')
  const score = input.solved ? `${input.guesses.length}/${input.maxGuesses}` : `X/${input.maxGuesses}`
  return `${input.title ?? txa('Günün Kapağı')} ${input.date} · ${score} ${marks}`.trim()
}
