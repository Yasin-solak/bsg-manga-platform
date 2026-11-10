import { ArrowLeft } from 'lucide-react'
import { useTx } from '@/i18n/LocaleProvider'

/**
 * Signup progress indicator (prototype: two dots + "1/2").
 *
 * In the prototype step 2 is a genre selection screen. Here SETUP comes after the form
 * (genres, recommendations and optional steps), so stopping the count at 2 would be a lie;
 * the indicator describes two PHASES, "form -> setup". The user does not want to know how many
 * screens remain, but that the form is not the END: a button saying "Sign up"
 * implied it was over.
 */

interface AuthSignupProgressProps {
  onBack: () => void
}

export default function AuthSignupProgress({ onBack }: AuthSignupProgressProps) {
  const tx = useTx()
  return (
    <div className="mb-4 flex items-center gap-3" data-testid="auth-signup-progress">
      <button
        type="button"
        onClick={onBack}
        data-testid="auth-back-to-welcome"
        className="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
        aria-label={tx('Geri')}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </button>
      <div className="flex flex-1 gap-1.5">
        <span className="h-1 flex-1 rounded-full bg-primary" />
        <span className="h-1 flex-1 rounded-full bg-muted" />
      </div>
      <span className="shrink-0 text-xs font-extrabold text-muted-foreground">1/2</span>
    </div>
  )
}
