import { maskEmail, type LastAccount } from '@/lib/lastAccount'
import { useTx } from '@/i18n/LocaleProvider'

/**
 * "Welcome back" card (prototype screen 2).
 *
 * Reminds who read last on this device. NO Face ID: the web equivalent is
 * passkey/WebAuthn and separate work; the card only recalls the email and
 * focuses the user on the password.
 *
 * SECURITY: NO TOKEN here. The info shown gives no account access; the password
 * (and 2FA if set) is still asked. The email prints MASKED, so someone looking
 * at the screen cannot learn the full address; the field fills with the full value
 * without showing it.
 */

interface AuthLastAccountCardProps {
  account: LastAccount
  onForget: () => void
}

export default function AuthLastAccountCard({ account, onForget }: AuthLastAccountCardProps) {
  const tx = useTx()
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5" data-testid="auth-last-account">
      <p className="m-0 text-sm font-black text-foreground">{tx('Tekrar hoş geldin')}</p>
      <p className="m-0 mt-1 text-xs text-muted-foreground">
        {tx('Bu cihazda en son bu hesapla okumuştun.')}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0 text-[13px] font-bold text-foreground">
          {maskEmail(account.email)}
        </span>
        <button
          type="button"
          data-testid="auth-forget-account"
          onClick={onForget}
          className="shrink-0 py-1 text-[12.5px] font-extrabold text-primary"
        >
          {tx('Başka bir hesapla gir')}
        </button>
      </div>
    </div>
  )
}
