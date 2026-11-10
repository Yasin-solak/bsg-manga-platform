/**
 * Security score.
 *
 * **Design principle: NOT A BADGE, A DOOR TO THE LIST.** "94/100" tells nobody what
 * to do; "1 open high finding" does. So the calculation always returns a
 * BREAKDOWN, and each lost point maps to one item.
 *
 * **Why an acceptance record is required.** Supabase advisor currently reports 103 findings but
 * 94 are deliberate design (the 208 pattern: tables closed, access through DEFINER
 * functions). Counted raw, the score stays at the bottom permanently, nobody looks after two weeks
 * and a real regression goes unnoticed. An accepted finding does
 * NOT lower the score; only an unaccepted one does.
 *
 * **Two sources, two rhythms.** Posture findings come from manual audits
 * and change slowly; runtime findings come from live data and
 * change hourly. Adding them into one number would mislead, so
 * they appear separately in the breakdown.
 *
 * The module is PURE: knows no network or browser.
 */

export type SecurityFindingSeverity = 'yuksek' | 'orta' | 'dusuk'

/** Her seviyenin puan bedeli; kirilimda aynen gosterilir. */
export const SEVERITY_PENALTY: Record<SecurityFindingSeverity, number> = {
  yuksek: 15,
  orta: 7,
  dusuk: 3,
}

/** Costs of open alarms. Kept separate since this is a runtime signal. */
export const ALERT_PENALTY = {
  critical: 10,
  high: 5,
} as const

/**
 * Ceiling of the runtime penalty.
 *
 * Without a ceiling a single alarm storm would drop the score to zero and hide
 * a real regression on the posture side.
 */
export const RUNTIME_PENALTY_CAP = 40

export interface SecurityScoreInput {
  /** Kabul EDILMEMIS durus bulgulari (denetimden gelir). */
  openFindings: { key: string; severity: SecurityFindingSeverity; label: string }[]
  /** Canli alarm sayaclari. */
  openCriticalAlerts: number
  openHighAlerts: number
}

export interface SecurityScoreLine {
  label: string
  penalty: number
  kind: 'durus' | 'calisma_zamani'
}

export interface SecurityScoreResult {
  /** 0..100 */
  score: number
  /** What each lost point maps to; the UI shows this as a list. */
  lines: SecurityScoreLine[]
  /** A rough label; it sets the color, not the decision. */
  band: 'iyi' | 'dikkat' | 'kotu'
}

export function computeSecurityScore(input: SecurityScoreInput): SecurityScoreResult {
  const lines: SecurityScoreLine[] = []

  for (const finding of input.openFindings) {
    lines.push({
      label: finding.label,
      penalty: SEVERITY_PENALTY[finding.severity],
      kind: 'durus',
    })
  }

  // Alarms are grouped on ONE row: if 12 alarms were 12 rows the list would
  // become unusable and posture findings would get lost among them.
  const rawRuntime = input.openCriticalAlerts * ALERT_PENALTY.critical
    + input.openHighAlerts * ALERT_PENALTY.high
  const runtimePenalty = Math.min(RUNTIME_PENALTY_CAP, rawRuntime)

  if (runtimePenalty > 0) {
    lines.push({
      label: `Acik alarm: ${input.openCriticalAlerts} kritik, ${input.openHighAlerts} yuksek`,
      penalty: runtimePenalty,
      kind: 'calisma_zamani',
    })
  }

  const total = lines.reduce((sum, line) => sum + line.penalty, 0)
  const score = Math.max(0, 100 - total)

  return {
    score,
    lines,
    band: score >= 90 ? 'iyi' : score >= 70 ? 'dikkat' : 'kotu',
  }
}
