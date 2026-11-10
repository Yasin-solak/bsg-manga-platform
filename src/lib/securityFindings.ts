import type { SecurityFindingSeverity } from './securityScore'
import { txa } from '@/i18n/activeLocale'

/**
 * OPEN security findings: the posture side of the score.
 *
 * **Why here and not in `docs/reports/security-accepted-findings.json`.** That file is the
 * human-facing audit record: accepted items, reasons,
 * compensating controls. The UI only needs the OPEN ones, and
 * `tsconfig` does not include anything outside `src`.
 *
 * **Since the two are separate they can drift.** So
 * `tests/contracts/securityscore-contract.test.mjs` compares both files:
 * the gate goes red if this differs from the JSON's open findings. Updating the record
 * by hand and forgetting this would silently make the score a lie.
 *
 * Findings change with audits, not hourly: after a new audit both this
 * list and the JSON are updated together.
 */
export interface OpenSecurityFinding {
  key: string
  severity: SecurityFindingSeverity
  label: string
  /** What needs to be done, so the score can be a "door to the list". */
  action: string
}

/** Last audit date; the UI should say how fresh the score is. */
export const SECURITY_AUDIT_DATE = '2026-08-06'

export const OPEN_SECURITY_FINDINGS: OpenSecurityFinding[] = [
  {
    key: 'extension_in_public',
    severity: 'dusuk',
    get label() { return txa('pg_net uzantisi public semada') },
    action: 'Uzantiyi ayri semaya tasi; once bagimliliklar cikarilmali (web push kullaniyor).',
  },
]
