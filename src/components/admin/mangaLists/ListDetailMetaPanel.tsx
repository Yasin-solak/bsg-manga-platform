import type { FormEvent } from 'react'
import { Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * List details: title, description, visibility.
 *
 * In the old version this form sat in a gray box sharing the "General" tab with summary
 * cards. Here there is one editing surface with no frames between fields:
 * stacked gray boxes were why the window looked messy.
 */

interface ListDetailMetaPanelProps {
  metaTitleDraft: string
  metaDescriptionDraft: string
  metaIsPublicDraft: boolean
  metaSaving: boolean
  onMetaTitleDraftChange: (value: string) => void
  onMetaDescriptionDraftChange: (value: string) => void
  onMetaIsPublicDraftChange: (value: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ListDetailMetaPanel({
  metaTitleDraft,
  metaDescriptionDraft,
  metaIsPublicDraft,
  metaSaving,
  onMetaTitleDraftChange,
  onMetaDescriptionDraftChange,
  onMetaIsPublicDraftChange,
  onSubmit,
}: ListDetailMetaPanelProps) {
  return (
    <form className="space-y-5" onSubmit={onSubmit} data-testid="admin-list-meta-panel">
      <section className="space-y-2">
        <FieldLabel title={txa('Başlık')} hint={txa('Liste kartında ve liste sayfasında görünür.')} />
        <Input
          value={metaTitleDraft}
          onChange={(event) => onMetaTitleDraftChange(event.target.value)}
          className="h-11"
          maxLength={120}
          aria-label={txa('Liste başlığı')}
        />
        <p className="m-0 text-[11px] text-muted-foreground">{metaTitleDraft.length}/120 karakter</p>
      </section>

      <section className="space-y-2">
        <FieldLabel title={txa('Açıklama')} hint={txa('Boş bırakılırsa liste kartında tanıtım metni görünmez.')} />
        <Textarea
          value={metaDescriptionDraft}
          onChange={(event) => onMetaDescriptionDraftChange(event.target.value)}
          className="min-h-[120px] w-full resize-y"
          placeholder={txa('Liste hakkında kısa bir tanıtım')}
          aria-label={txa('Liste açıklaması')}
        />
        <p className="m-0 text-[11px] text-muted-foreground">{metaDescriptionDraft.length}{' '}{txa('karakter')}</p>
      </section>

      <section className="space-y-2">
        <FieldLabel
          title={txa('Görünürlük')}
          hint={txa('Özel listeleri yalnız sahibi görür; herkese açık listeler katalogda yer alır.')}
        />
        {/* Iki secenek de gorunur: acilir menu ile gizlemek, hangi durumda
            oldugunu okumayi zorlastiriyordu. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label={txa('Liste görünürlüğü')}>
          <VisibilityChoice
            selected={metaIsPublicDraft}
            icon={<Globe className="size-4" aria-hidden="true" />}
            label={txa('Herkese açık')}
            onSelect={() => onMetaIsPublicDraftChange(true)}
          />
          <VisibilityChoice
            selected={!metaIsPublicDraft}
            icon={<Lock className="size-4" aria-hidden="true" />}
            label={txa('Özel')}
            onSelect={() => onMetaIsPublicDraftChange(false)}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" className="min-h-11" disabled={metaSaving}>
          {metaSaving ? txa('Kaydediliyor…') : txa('Değişiklikleri kaydet')}
        </Button>
      </div>
    </form>
  )
}

function VisibilityChoice({
  selected,
  icon,
  label,
  onSelect,
}: {
  selected: boolean
  icon: React.ReactNode
  label: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
        selected
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function FieldLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h4 className="m-0 font-heading text-sm text-foreground">{title}</h4>
      <p className="m-0 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
