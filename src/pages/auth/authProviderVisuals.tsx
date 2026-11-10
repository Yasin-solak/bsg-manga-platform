import { txa } from '@/i18n/activeLocale'
/**
 * Visual parts of provider buttons.
 *
 * Split out when AuthPage passed the 850-line threshold. Icons and short labels are purely
 * visual and unrelated to form logic, so they were the first
 * part to extract.
 *
 * Labels are SHORT because buttons sit side by side on the signup screen (prototype):
 * "Continue with Google" does not fit two columns.
 */

export const PROVIDER_SHORT_LABELS: Record<string, string> = {
  google: 'Google',
  get discord() { return txa('Discord') },
}

export function ProviderGlyph({ id }: { id: string }) {

  if (id === 'google') {
    return (
      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
        <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.7 4.1-5.35 4.1a5.9 5.9 0 1 1 0-11.8c1.68 0 2.81.72 3.46 1.34l2.36-2.28C16.3 3.9 14.35 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.66 8.64-8.8 0-.6-.06-1.05-.15-1.5Z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path fill="currentColor" d="M19.6 5.6A16.9 16.9 0 0 0 15.4 4.3l-.2.4a15.7 15.7 0 0 1 3.6 1.5 12 12 0 0 0-9.6 0 15.7 15.7 0 0 1 3.6-1.5l-.2-.4a16.9 16.9 0 0 0-4.2 1.3C5 9 4.3 12.3 4.6 15.6a17 17 0 0 0 5.1 2.6l.7-1a11 11 0 0 1-1.9-.9l.5-.4a12.2 12.2 0 0 0 10 0l.5.4c-.6.4-1.2.7-1.9.9l.7 1a17 17 0 0 0 5.1-2.6c.4-3.8-.6-7.1-2.8-10Zm-9.9 8c-.9 0-1.6-.8-1.6-1.8s.7-1.9 1.6-1.9c.9 0 1.6.9 1.6 1.9s-.7 1.8-1.6 1.8Zm4.6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.9 1.6-1.9c.9 0 1.6.9 1.6 1.9s-.7 1.8-1.6 1.8Z" />
    </svg>
  )
}
