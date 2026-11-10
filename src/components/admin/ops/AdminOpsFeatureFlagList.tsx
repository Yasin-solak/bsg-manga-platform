import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { AdminFeatureFlagItem } from '@/services/adminOpsService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatDateTime, type FeatureFlagDraft } from './adminOpsUtils'
import { txa } from '@/i18n/activeLocale'

/**
 * Flag list: the grouped card layout from the design handoff.
 *
 * It used to be a six-column table with name/description inputs open on every row:
 * all 22 flags sat permanently in edit mode, and "which is on" got lost among dozens of
 * inputs. Now it is a card in read mode, with editing opened by **Details**.
 *
 * **Grouping derives from the key's PREFIX** (`community.*`, `economy.*`).
 * The handoff has handwritten categories; keeping them as a separate field would be
 * a second record to FORGET updating when a flag is added. The prefix
 * is already in the key and cannot be wrong.
 *
 * The handoff's "impact level" badge is DELIBERATELY ABSENT: it has no match in the database
 * or registry. An invented "Critical impact" label would make it harder to find what is
 * really critical.
 */

interface AdminOpsFeatureFlagListProps {
  featureFlags: AdminFeatureFlagItem[]
  drafts: Record<string, FeatureFlagDraft>
  loading: boolean
  error: string | null
  savingFlagId: string | null
  filterLabel: string
  search: string
  onClearFilters: () => void
  onUpdateDraft: (flagId: string, patch: Partial<FeatureFlagDraft>) => void
  /** Saves; if `patch` is given it applies WITHOUT WAITING for the draft commit. */
  onSaveFlag: (flag: AdminFeatureFlagItem, patch?: Partial<FeatureFlagDraft>) => void
}

/** `community.spoilers` -> `community`. With no dot the flag falls in the "other" group. */
function groupKeyOf(flagKey: string): string {
  const dot = flagKey.indexOf('.')
  return dot > 0 ? flagKey.slice(0, dot) : 'diger'
}

interface FlagGroup {
  key: string
  flags: AdminFeatureFlagItem[]
  enabledCount: number
}

function buildGroups(flags: AdminFeatureFlagItem[]): FlagGroup[] {
  const map = new Map<string, AdminFeatureFlagItem[]>()
  for (const flag of flags) {
    const key = groupKeyOf(flag.key)
    const bucket = map.get(key)
    if (bucket) bucket.push(flag)
    else map.set(key, [flag])
  }
  return Array.from(map.entries())
    .map(([key, groupFlags]) => ({
      key,
      flags: groupFlags,
      enabledCount: groupFlags.filter((item) => item.isEnabled).length,
    }))
    .sort((a, b) => b.flags.length - a.flags.length || a.key.localeCompare(b.key, 'tr'))
}

export function AdminOpsFeatureFlagList({
  featureFlags,
  drafts,
  loading,
  error,
  savingFlagId,
  filterLabel,
  search,
  onClearFilters,
  onUpdateDraft,
  onSaveFlag,
}: AdminOpsFeatureFlagListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [openDetailId, setOpenDetailId] = useState<string | null>(null)

  if (loading) {
    return (
      <AdminSurface className="p-5">
        <p className="m-0 text-sm text-muted-foreground">{txa('Bayraklar yükleniyor…')}</p>
      </AdminSurface>
    )
  }

  if (error) {
    return (
      <AdminSurface className="p-5">
        <p className="m-0 text-sm text-muted-foreground">{error}</p>
      </AdminSurface>
    )
  }

  if (featureFlags.length === 0) {
    // An empty list must SAY WHY and give a way out.
    return (
      <AdminSurface className="border-dashed p-8 text-center">
        <p className="m-0 text-sm text-muted-foreground">
          {filterLabel || search.trim()
            ? txa('Bu filtreye uyan bayrak yok.')
            : txa('Henüz bayrak yok.')}
        </p>
        {filterLabel || search.trim() ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-2 text-sm font-semibold text-primary hover:underline"
          >
            {txa('Filtreleri temizle')}
          </button>
        ) : null}
      </AdminSurface>
    )
  }

  return (
    <div className="space-y-4" data-testid="admin-ops-flag-list">
      {buildGroups(featureFlags).map((group) => {
        const isOpen = !collapsed[group.key]
        return (
          <section key={group.key}>
            <button
              type="button"
              onClick={() => setCollapsed((current) => ({ ...current, [group.key]: isOpen }))}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted"
            >
              <ChevronRight
                className={cn(
                  'size-3.5 text-muted-foreground transition-transform',
                  isOpen && 'rotate-90',
                )}
                aria-hidden="true"
              />
              <span className="text-xs font-bold uppercase tracking-wide text-foreground">
                {group.key}
              </span>
              <span className="text-xs text-muted-foreground">
                {txa('{v1} flag · {v2} aktif', { v1: group.flags.length, v2: group.enabledCount })}
              </span>
            </button>

            {isOpen ? (
              <div className="space-y-2">
                {group.flags.map((flag) => {
                  const draft = drafts[flag.id]
                  if (!draft) return null
                  const saving = savingFlagId === flag.id
                  const detailOpen = openDetailId === flag.id

                  return (
                    <AdminSurface
                      key={flag.id}
                      className={cn('p-4', draft.isEnabled && 'border-primary/25')}
                      data-testid="admin-ops-flag-card"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-[260px] flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <code className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {flag.key}
                            </code>
                            {draft.isPublic ? (
                              <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                                {txa('Public')}
                              </span>
                            ) : null}
                          </div>
                          <p className="m-0 text-sm font-semibold text-foreground">
                            {draft.label ? txa(draft.label) : flag.key}
                          </p>
                          {draft.description ? (
                            <p className="m-0 mt-0.5 max-w-prose text-[13px] leading-5 text-muted-foreground">
                              {txa(draft.description)}
                            </p>
                          ) : null}
                          <p className="m-0 mt-2 text-[11px] text-muted-foreground">
                            {txa('Son degisiklik:')}{' '}{formatDateTime(flag.updatedAt)}
                            {flag.updatedByUser?.username ? ` · ${flag.updatedByUser.username}` : ''}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-5">
                          <div className="text-center">
                            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                              {txa('Rollout')}
                            </div>
                            <div className="mt-1 text-sm font-bold tabular-nums text-foreground">
                              %{draft.rolloutPercent}
                            </div>
                          </div>

                          {/*
                            Anahtar ANINDA kaydeder. Ayri bir "Kaydet" adimi
                            beklemek, acik gorunen ama kapali olan bayrak
                            uretirdi — operasyon panelinde en pahali yanlis bu.
                            `patch` sart: taslak state'i commit olmadan yazim
                            baslar; taslaktan okusaydik ESKI degeri gonderirdi.
                          */}
                          <div className="text-center">
                            <Switch
                              checked={draft.isEnabled}
                              disabled={saving}
                              onCheckedChange={(next) => {
                                onUpdateDraft(flag.id, { isEnabled: next })
                                onSaveFlag(flag, { isEnabled: next })
                              }}
                              aria-label={txa('{v1} bayragini ac kapat', { v1: flag.key })}
                            />
                            <div
                              className={cn(
                                'mt-1 text-[11px] font-semibold',
                                draft.isEnabled ? 'text-primary' : 'text-muted-foreground',
                              )}
                            >
                              {saving ? '...' : draft.isEnabled ? txa('Açık') : txa('Kapali')}
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            variant={detailOpen ? 'default' : 'outline'}
                            onClick={() => setOpenDetailId(detailOpen ? null : flag.id)}
                          >
                            {detailOpen ? txa('Kapat') : txa('Detay')}
                          </Button>
                        </div>
                      </div>

                      {detailOpen ? (
                        <div className="mt-4 space-y-3 border-t border-border pt-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                              {txa('Baslik')}
                              <Input
                                value={draft.label}
                                maxLength={80}
                                onChange={(event) =>
                                  onUpdateDraft(flag.id, { label: event.target.value })
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                              {txa('Kademeli acilim — %{v1} kullaniciya acik', { v1: draft.rolloutPercent })}
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={draft.rolloutPercent}
                                onChange={(event) =>
                                  onUpdateDraft(flag.id, {
                                    rolloutPercent: Number(event.target.value),
                                  })
                                }
                                className="mt-2 w-full accent-primary"
                                aria-label={txa('Rollout yuzdesi')}
                              />
                            </label>
                          </div>

                          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                            {txa('Aciklama — bu flag acikken ne olur?')}
                            <Textarea
                              value={draft.description}
                              rows={2}
                              maxLength={400}
                              onChange={(event) =>
                                onUpdateDraft(flag.id, { description: event.target.value })
                              }
                            />
                          </label>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
                              <input
                                type="checkbox"
                                className="size-4"
                                checked={draft.isPublic}
                                onChange={(event) =>
                                  onUpdateDraft(flag.id, { isPublic: event.target.checked })
                                }
                              />
                              {txa('Public (istemci tarafinda okunabilir)')}
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              disabled={saving}
                              onClick={() => onSaveFlag(flag)}
                            >
                              {saving ? txa('Kaydediliyor...') : txa('Değişiklikleri kaydet')}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </AdminSurface>
                  )
                })}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
