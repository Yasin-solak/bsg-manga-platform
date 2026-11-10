import { useEffect, useMemo, useState } from 'react'
import { Shield, Sparkles, Tag } from 'lucide-react'

import FansubIdentityTagChip, { FansubIdentityBadgeIcon } from '@/components/common/FansubIdentityTagChip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { normalizeFansubIdentityShortcode } from '@/lib/fansubIdentityTags'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import {
  listFansubIdentityBadgeCatalog,
  listFansubIdentityTagsForManagement,
  upsertFansubIdentityTag,
  type FansubIdentityBadgeCatalogItem,
  type FansubIdentityTagManagementItem,
} from '@/services/fansubIdentityTagService'
import { toast } from '@/services/toastService'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubIdentityTagManagementPanelProps = {
  fansubId?: string
  boostSnapshot?: FansubBoostSnapshot | null
  onDataChanged?: () => void
  compact?: boolean
}

type IdentityDraft = {
  shortcode: string
  badgeKey: string
  isActive: boolean
}

const DEFAULT_BADGE_KEY = 'blade'

function formatGovernanceDate(value?: string | null) {
  if (!value) return null

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return null

  return new Intl.DateTimeFormat(intlLocale(), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate)
}

function buildDefaultDraft(
  item: FansubIdentityTagManagementItem | null,
  badges: FansubIdentityBadgeCatalogItem[],
): IdentityDraft {
  return {
    shortcode: item?.shortcode || '',
    badgeKey: item?.badgeKey || badges[0]?.badgeKey || DEFAULT_BADGE_KEY,
    isActive: item?.isActive ?? true,
  }
}

export default function FansubIdentityTagManagementPanel({
  fansubId,
  boostSnapshot,
  onDataChanged,
  compact = false,
}: FansubIdentityTagManagementPanelProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [item, setItem] = useState<FansubIdentityTagManagementItem | null>(null)
  const [badgeCatalog, setBadgeCatalog] = useState<FansubIdentityBadgeCatalogItem[]>([])
  const [draft, setDraft] = useState<IdentityDraft>({
    shortcode: '',
    badgeKey: DEFAULT_BADGE_KEY,
    isActive: true,
  })
  const [isSaving, setIsSaving] = useState(false)

  const hasCapability = boostSnapshot?.capabilities?.hasFansubIdentityTags === true
  const tierLevel = boostSnapshot?.tierLevel ?? 0
  const canSave = Boolean(fansubId && hasCapability && tierLevel >= 1)

  useEffect(() => {
    if (!fansubId) {
      setIsLoading(false)
      setItem(null)
      setBadgeCatalog([])
      return
    }

    let cancelled = false
    setIsLoading(true)

    void Promise.all([
      listFansubIdentityBadgeCatalog(),
      listFansubIdentityTagsForManagement(fansubId),
    ])
      .then(([badges, nextItems]) => {
        if (cancelled) return
        const nextItem = nextItems[0] ?? null
        setBadgeCatalog(badges)
        setItem(nextItem)
        setDraft(buildDefaultDraft(nextItem, badges))
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[FansubIdentityTagManagementPanel] load error', error)
        toast.error(error instanceof Error ? error.message : txa('Fansub etiketi yuklenemedi.'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fansubId])

  const badgeOptions = useMemo(
    () => [...badgeCatalog].sort((a, b) => a.sortOrder - b.sortOrder),
    [badgeCatalog],
  )
  const normalizedDraftShortcode = normalizeFansubIdentityShortcode(draft.shortcode)
  const normalizedCurrentShortcode = normalizeFansubIdentityShortcode(item?.shortcode || '')
  const isIdentityVisualChangeRequested = Boolean(item) && (
    normalizedDraftShortcode !== normalizedCurrentShortcode
    || draft.badgeKey !== (item?.badgeKey || DEFAULT_BADGE_KEY)
  )
  const isIdentityChangeLocked = isIdentityVisualChangeRequested && item?.canChangeIdentity === false
  const cooldownEndsLabel = formatGovernanceDate(item?.cooldownEndsAt)

  const previewTag = {
    id: item?.id || 'shared-preview',
    fansubId: item?.fansubId || fansubId || 'preview',
    fansubName: item?.fansubName || null,
    fansubSlug: item?.fansubSlug || null,
    audience: 'shared' as const,
    shortcode: normalizedDraftShortcode || item?.shortcode || 'TAG',
    badgeKey: draft.badgeKey || item?.badgeKey || DEFAULT_BADGE_KEY,
  }

  async function handleSave() {
    if (!fansubId) return

    if (!normalizedDraftShortcode) {
      toast.warning(txa('Etiket kodu bos birakilamaz.'))
      return
    }

    if (isIdentityChangeLocked) {
      toast.warning(
        cooldownEndsLabel
          ? txa('Etiket kodu ve rozet haftada bir degisebilir. Sonraki degisim {v1} sonrasinda acilir.', { v1: cooldownEndsLabel })
          : txa('Etiket kodu ve rozet haftada bir degisebilir.'),
      )
      return
    }

    setIsSaving(true)
    try {
      const savedItem = await upsertFansubIdentityTag({
        fansubId,
        shortcode: normalizedDraftShortcode,
        badgeKey: draft.badgeKey,
        isActive: draft.isActive,
      })
      setItem(savedItem)
      setDraft(buildDefaultDraft(savedItem, badgeCatalog))
      toast.success(txa('Fansub etiketi kaydedildi.'))
      onDataChanged?.()
    } catch (error) {
      console.error('[FansubIdentityTagManagementPanel] save error', error)
      toast.error(error instanceof Error ? error.message : txa('Fansub etiketi kaydedilemedi.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article className={cn(
      'rounded-3xl border border-border/70 bg-card/98',
      compact ? 'p-4' : 'p-5',
    )}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground">
            <Tag className="size-3.5 text-primary" />
            {txa('Fansub etiketi')}
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground">{txa('Tek etiket, tum uygun kullanicilar')}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {txa('Bu etiket hem fansub uyelerinde hem aktif destekcilerde ayni gorunur. Profil seciminde kullanici isterse bunu acar.')}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
          <Shield className="size-3.5 text-primary" />
          {txa('Tier 1 gerektirir')}
        </div>
      </div>

      {!canSave ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-background/55 px-4 py-3 text-sm leading-6 text-muted-foreground">
          {hasCapability
            ? txa('Capability acik fakat aktif tier verisi yenilenmeden kayit yapilamaz.')
            : txa('Fansub etiketi icin en az Seviye 1 capability gerekir.')}
        </div>
      ) : null}

      {canSave && item ? (
        <div
          className={cn(
            'mt-4 rounded-2xl border px-4 py-3 text-sm',
            item.canChangeIdentity
              ? 'border-border/70 bg-background/60 text-muted-foreground'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100',
          )}
        >
          <p className="m-0 font-medium text-foreground">
            {item.canChangeIdentity
              ? txa('Etiket kodu ve rozet su anda degistirilebilir.')
              : txa('Etiket kodu ve rozet icin haftalik degisim kilidi aktif.')}
          </p>
          <p className="mt-1 leading-6">
            {item.canChangeIdentity
              ? txa('Kaydettiginde yeni kimlik tum uye ve destekci yuzeylerine yansir.')
              : (cooldownEndsLabel
                ? txa('Sonraki shortcode veya rozet degisimi {v1} sonrasinda acilir.', { v1: cooldownEndsLabel })
                : txa('Sonraki shortcode veya rozet degisimi cooldown tamamlaninca acilir.'))}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {txa('Aktiflik ac/kapat durumu bu kilitten bagimsiz calisir.')}
          </p>
        </div>
      ) : null}

      <div className={cn(
        'mt-4 grid gap-4',
        compact ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : 'xl:grid-cols-[minmax(0,1fr)_320px]',
      )}>
        <section className="rounded-2xl border border-border/70 bg-background/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{txa('Etiket ayari')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {txa('En fazla 4 karakter, sadece harf ve sayi.')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{txa('Aktif')}</span>
              <Switch
                checked={draft.isActive}
                disabled={!canSave || isSaving}
                onCheckedChange={(checked) => setDraft((previous) => ({ ...previous, isActive: checked }))}
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {txa('Etiket kodu')}
              </span>
              <Input
                value={draft.shortcode}
                maxLength={4}
                disabled={!canSave || isSaving}
                onChange={(event) => setDraft((previous) => ({
                  ...previous,
                  shortcode: normalizeFansubIdentityShortcode(event.target.value),
                }))}
                placeholder="WUMP"
                className="h-10 text-sm font-semibold uppercase tracking-[0.22em]"
              />
            </label>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {txa('Rozet sec')}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {badgeOptions.map((badge) => {
                  const isSelected = draft.badgeKey === badge.badgeKey
                  return (
                    <button
                      key={badge.badgeKey}
                      type="button"
                      disabled={!canSave || isSaving}
                      onClick={() => setDraft((previous) => ({ ...previous, badgeKey: badge.badgeKey }))}
                      className={cn(
                        'rounded-2xl border px-2 py-2 text-center transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border/70 bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                      )}
                    >
                      <span className="mx-auto flex size-8 items-center justify-center rounded-xl border border-border/60 bg-background/70">
                        <FansubIdentityBadgeIcon badgeKey={badge.badgeKey} className="size-4" />
                      </span>
                      <span className="mt-1 block truncate text-[10px]">{badge.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              type="button"
              disabled={!canSave || isSaving || normalizedDraftShortcode.length === 0 || isIdentityChangeLocked}
              onClick={() => void handleSave()}
            >
              {isSaving ? txa('Kaydediliyor...') : txa('Fansub etiketini kaydet')}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card/60 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{txa('Onizleme')}</p>
          <div className="mt-3 space-y-3">
            <FansubIdentityTagChip tag={previewTag} size='sm' />
            <div className="rounded-2xl border border-border/70 bg-background/60 px-3 py-3 text-sm text-muted-foreground">
              {txa('Bu gorunum uye listesi, yorum, profil ve destekci yuzeylerinde ayni token ile kullanilir.')}
            </div>
            {!item && !isLoading ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 px-3 py-3 text-sm text-muted-foreground">
                {txa('Henuz kayitli etiket yok. Ilk kayit sonrasinda secilebilir hale gelir.')}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {isLoading ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 animate-pulse text-primary" />
          {txa('Fansub etiketi yukleniyor...')}
        </div>
      ) : null}
    </article>
  )
}
