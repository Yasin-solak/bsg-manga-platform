import { Link } from '@/i18n/router'
import { Button } from '@/components/ui/button'
import { txa } from '@/i18n/activeLocale'

export function StoreLinkState({
  href,
  onClose,
  text,
}: {
  href: string
  onClose: () => void
  text: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-8">
      <p className="m-0 text-sm text-muted-foreground">{text}</p>
      <Button asChild variant="link" className="mt-2 px-0">
        <Link to={href} onClick={onClose}>{txa('Magazaya git')}</Link>
      </Button>
    </div>
  )
}

export function BoostLinkState({
  onOpenBoost,
  text,
}: {
  onOpenBoost?: () => void
  text: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-8">
      <p className="m-0 text-sm text-muted-foreground">{text}</p>
      {onOpenBoost ? (
        <Button type="button" variant="link" className="mt-2 px-0" onClick={onOpenBoost}>
          {txa('Takviyeye git')}
        </Button>
      ) : null}
    </div>
  )
}
