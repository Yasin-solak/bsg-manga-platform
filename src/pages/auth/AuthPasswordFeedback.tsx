import { Check, Circle } from 'lucide-react'
import type { PasswordStrength } from '@/lib/passwordStrength'
import { cn } from '@/lib/utils'
import { useTx } from '@/i18n/LocaleProvider'

/**
 * Password strength bars + rule list (prototype signup screen).
 *
 * Strength derives from the POLICY itself; inventing a separate score would produce a password
 * that looks "Strong" but is rejected on submit.
 *
 * The rule list goes beyond saying "weak": it says WHAT is missing.
 * A user cannot strengthen it without knowing what to fix.
 */

export interface PasswordRule {
  id: string
  label: string
  ok: boolean
}

interface AuthPasswordFeedbackProps {
  strength: PasswordStrength
  rules: PasswordRule[]
}

export default function AuthPasswordFeedback({ strength, rules }: AuthPasswordFeedbackProps) {
  const tx = useTx()
  return (
    <>
      <div className="flex items-center gap-2" data-testid="auth-password-strength">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                index < strength.filledBars
                  ? strength.level === 'guclu'
                    ? 'bg-primary'
                    : strength.level === 'orta'
                      ? 'bg-amber-500'
                      : 'bg-destructive'
                  : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span className="text-[11px] font-bold text-muted-foreground">{tx(strength.label)}</span>
      </div>

      <ul className="m-0 flex flex-wrap gap-x-3 gap-y-1 p-0" data-testid="auth-password-rules">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              'flex list-none items-center gap-1 text-[11px] font-semibold',
              rule.ok ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {rule.ok
              ? <Check className="size-3" aria-hidden="true" />
              : <Circle className="size-3" aria-hidden="true" />}
            {rule.label}
          </li>
        ))}
      </ul>
    </>
  )
}
