import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { Check, ExternalLink, HeartHandshake, History, Loader2, Lock, Plus, X, Zap } from 'lucide-react'

import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { listMyFansubBoostHistory, type MyFansubBoostHistoryItem } from '@/services/fansubBoostService'
import type { MySelectableFansubIdentityTag } from '@/services/fansubIdentityTagService'
import type { FollowingFansub } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

type ProfileEditFansubIdentitySectionProps = {
  followedFansubs: FollowingFansub[]
  items: MySelectableFansubIdentityTag[]
  profileUserId?: string | null
  selectedTagId: string | null
  disabled?: boolean
  isLoading?: boolean
  onClose: () => void
  onSelectedTagIdChange: (tagId: string | null) => void
}

function resolveFansubHref(fansub: Pick<FollowingFansub, 'id' | 'slug'>) {
  return `/fansub/${fansub.slug || fansub.id}?tab=takviye`
}

function buildInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FS'
}

function formatBoostDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return txa('Tarih bilinmiyor')

  return new Intl.DateTimeFormat(intlLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function resolveBoostStatusLabel(item: MyFansubBoostHistoryItem) {
  if (item.status !== 'active') return txa('Sona erdi')
  const expiresAt = new Date(item.expiresAt)
  if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) return txa('Sona erdi')
  return txa('Aktif')
}

function BoostHistoryRow({ item, onClose }: { item: MyFansubBoostHistoryItem; onClose: () => void }) {
  const statusLabel = resolveBoostStatusLabel(item)

  return (
    <Link
      to={`/fansub/${item.fansubSlug || item.fansubId}?tab=takviye`}
      onClick={onClose}
      className="flex min-w-0 items-center justify-between gap-3 rounded-[12px] border border-border/55 bg-background/55 px-3 py-2 text-left transition-colors hover:border-primary/35 hover:bg-primary/10"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {item.fansubAvatarUrl ? (
          <img
            src={item.fansubAvatarUrl}
            alt={item.fansubName}
            loading="lazy"
            decoding="async"
            className="size-9 shrink-0 rounded-full border border-border/60 object-cover"
          />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-[11px] font-black text-primary">
            {buildInitials(item.fansubName)}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-black text-foreground">{item.fansubName}</p>
            <span className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black',
              statusLabel === 'Aktif'
                ? 'border-primary/35 bg-primary/10 text-primary'
                : 'border-border/60 bg-muted/30 text-muted-foreground',
            )}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {formatBoostDate(item.grantedAt)} · +{item.boostPower.toLocaleString(intlLocale())}{' '}{txa('guc ·')}{' '}{item.coinCost.toLocaleString(intlLocale())} coin
          </p>
        </div>
      </div>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </Link>
  )
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-h-0 w-full flex-col">
      {children}
    </section>
  )
}

function LoadingPanel() {
  return (
    <PanelShell>
      <div className="flex min-h-[180px] items-center justify-center text-sm text-muted-foreground">
        {txa('Fansub etiketleri yükleniyor...')}
      </div>
    </PanelShell>
  )
}

function EmptyAvailableState() {
  return (
    <div className="rounded-[14px] border border-dashed border-border/60 bg-background/45 px-4 py-4 text-sm text-muted-foreground">
      {txa('Şu an seçilebilir fansub etiketi yok. Takip ettiğin fansublara takviye vererek destekçi etiketlerini açabilirsin.')}
    </div>
  )
}

function FollowedFansubAvatar({ fansub }: { fansub: FollowingFansub }) {
  if (fansub.avatar) {
    return (
      <img
        src={fansub.avatar}
        alt={fansub.name}
        loading="lazy"
        decoding="async"
        className="size-10 rounded-full border border-border/70 object-cover"
      />
    )
  }

  return (
    <span className="flex size-10 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-sm font-black text-primary">
      {buildInitials(fansub.name)}
    </span>
  )
}

function SelectableTagAvatar({ fansub, name }: { fansub?: FollowingFansub; name: string }) {
  if (fansub?.avatar) {
    return (
      <img
        src={fansub.avatar}
        alt={name}
        loading="lazy"
        decoding="async"
        className="size-11 shrink-0 rounded-full border border-border/70 object-cover"
      />
    )
  }
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-sm font-black text-primary">
      {buildInitials(name)}
    </span>
  )
}

function SelectableTagButton({
  disabled,
  item,
  fansub,
  selected,
  onSelect,
}: {
  disabled?: boolean
  item: MySelectableFansubIdentityTag
  fansub?: FollowingFansub
  selected: boolean
  onSelect: () => void
}) {
  const fansubName = item.fansubName || fansub?.name || txa('Fansub etiketi')
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-[14px] border px-3 py-3 text-left transition duration-200',
        'hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
        selected
          ? 'border-primary bg-primary/12 shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_16px_38px_rgba(239,68,68,0.1)]'
          : 'border-border/60 bg-background/55',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute -left-8 -top-8 size-24 rounded-full bg-primary/12 blur-2xl transition-opacity duration-200',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70',
        )}
        aria-hidden
      />
      <SelectableTagAvatar fansub={fansub} name={fansubName} />
      <div className="relative min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-black text-foreground">{fansubName}</p>
        <FansubIdentityTagChip tag={item} size="xs" showAudienceLabel />
      </div>
      <span
        className={cn(
          'relative flex size-8 shrink-0 items-center justify-center rounded-full border transition-all duration-200',
          selected
            ? 'border-primary/45 bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(239,68,68,0.3)]'
            : 'border-border/60 bg-background/70 text-muted-foreground group-hover:scale-110 group-hover:border-primary/45 group-hover:text-primary',
        )}
      >
        {selected ? <Check className="size-4" /> : <Plus className="size-4" />}
      </span>
    </button>
  )
}

function LockedFansubCard({
  fansub,
  onClose,
}: {
  fansub: FollowingFansub
  onClose: () => void
}) {
  return (
    <article className="group relative flex min-h-[148px] flex-col overflow-hidden rounded-[14px] border border-border/60 bg-background/45 p-2.5 pt-3 text-center transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_44px_rgba(0,0,0,0.3)]">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_70%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden />
      <div className="relative mx-auto">
        <span className="absolute inset-0 -m-1 rounded-full border border-dashed border-border/70 transition-colors group-hover:border-primary/40" aria-hidden />
        <span className="block grayscale transition duration-300 group-hover:grayscale-0">
          <FollowedFansubAvatar fansub={fansub} />
        </span>
        <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors group-hover:border-primary/45 group-hover:text-primary">
          <Lock className="size-3" />
        </span>
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-black text-foreground">{fansub.name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{txa('Destekçi etiketi kilitli')}</p>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/45">
          <div className="h-full w-0 rounded-full bg-primary transition-all duration-500 group-hover:w-[12%]" />
        </div>
        <span className="text-[10px] font-black text-muted-foreground">0/1</span>
      </div>
      <Button asChild size="sm" variant="outline" className="mt-auto h-7 rounded-[10px] border-primary/30 bg-primary/10 text-xs font-black text-primary hover:bg-primary/15">
        <Link to={resolveFansubHref(fansub)} onClick={onClose}>
          <HeartHandshake className="mr-1.5 size-3.5" />
          {txa('Takviye Yap')}
        </Link>
      </Button>
    </article>
  )
}

export default function ProfileEditFansubIdentitySection({
  followedFansubs,
  items,
  profileUserId,
  selectedTagId,
  disabled = false,
  isLoading = false,
  onClose,
  onSelectedTagIdChange,
}: ProfileEditFansubIdentitySectionProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [historyItems, setHistoryItems] = useState<MyFansubBoostHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const historyRequestIdRef = useRef(0)

  const selectedTag = items.find((item) => item.id === selectedTagId) ?? null

  // Avatar/name mapping of followed fansubs, to show the fansub image on the selectable tag card
  // (tag presentation has no avatar).
  const fansubDirectory = useMemo(() => {
    const map = new Map<string, FollowingFansub>()
    for (const fansub of followedFansubs) {
      map.set(fansub.id, fansub)
      if (fansub.slug) map.set(fansub.slug, fansub)
    }
    return map
  }, [followedFansubs])

  // EVERY unlocked fansub (in items), regardless of audience, is removed from the
  // "unlock tag" list; matched by id or slug.
  const unlockedFansubRefs = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      if (item.fansubId) set.add(item.fansubId)
      if (item.fansubSlug) set.add(item.fansubSlug)
    }
    return set
  }, [items])
  const lockedFollowedFansubs = useMemo(
    () => followedFansubs.filter(
      (fansub) => !unlockedFansubRefs.has(fansub.id) && !(fansub.slug ? unlockedFansubRefs.has(fansub.slug) : false),
    ),
    [followedFansubs, unlockedFansubRefs],
  )

  useEffect(() => {
    if (!showHistory || hasLoadedHistory) return

    const requestId = historyRequestIdRef.current + 1
    historyRequestIdRef.current = requestId

    setHistoryLoading(true)
    setHistoryError(null)

    listMyFansubBoostHistory({ limit: 12, supporterUserId: profileUserId })
      .then((nextItems) => {
        if (historyRequestIdRef.current !== requestId) return
        setHistoryItems(nextItems)
        setHasLoadedHistory(true)
      })
      .catch(() => {
        if (historyRequestIdRef.current !== requestId) return
        setHistoryError(txa('Takviye geçmişi yüklenemedi.'))
      })
      .finally(() => {
        if (historyRequestIdRef.current === requestId) setHistoryLoading(false)
      })
  }, [hasLoadedHistory, profileUserId, showHistory])

  if (isLoading) return <LoadingPanel />

  return (
    <PanelShell>
      <div className="flex min-h-0 flex-1 flex-col space-y-5">
        {/* Aktif etiket onizlemesi */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/40 p-4">
          <span className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">{txa('Aktif etiketin')}</p>
              <h5 className="m-0 mt-0.5 text-sm font-black text-foreground">{txa('Profil adının yanında görünür')}</h5>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
              {selectedTag ? 1 : 0}/1 aktif
            </span>
          </div>
          <div className="relative mt-3 flex flex-wrap items-center gap-3">
            {selectedTag ? (
              <>
                <span className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-2">
                  <span className="text-sm font-black text-foreground">@{selectedTag.fansubSlug || 'kullanici'}</span>
                  <FansubIdentityTagChip tag={selectedTag} size="sm" />
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onSelectedTagIdChange(null)}
                  className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-primary"
                >
                  <X className="mr-1.5 size-3.5" />
                  {txa('Gizle')}
                </Button>
              </>
            ) : (
              <p className="m-0 text-xs text-muted-foreground">
                {txa('Şu an aktif etiket yok. Aşağıdan bir etiket seçince profil adının yanında görünür.')}
              </p>
            )}
          </div>
        </div>

        {/* Secilebilir etiketler */}
        <section className="space-y-2.5">
          <div>
            <h5 className="m-0 text-sm font-black text-foreground">{txa('Seçilebilir etiketler')}</h5>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">{txa('Üye olduğun veya takviye verdiğin fansubların etiketleri.')}</p>
          </div>
          <div className="grid gap-2.5 md:grid-cols-2">
            {items.length > 0 ? (
              items.map((item) => (
                <SelectableTagButton
                  key={item.id}
                  disabled={disabled}
                  item={item}
                  fansub={fansubDirectory.get(item.fansubId) || (item.fansubSlug ? fansubDirectory.get(item.fansubSlug) : undefined)}
                  selected={selectedTagId === item.id}
                  onSelect={() => onSelectedTagIdChange(item.id)}
                />
              ))
            ) : (
              <EmptyAvailableState />
            )}
          </div>
        </section>

        {/* Kilitli fansublar */}
        <section className="space-y-2.5 border-t border-border/40 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h5 className="m-0 text-sm font-black text-foreground">{txa('Etiket kilidini aç')}</h5>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                {txa('Takip ettiğin ama takviye vermediğin fansubların destekçi etiketleri.')}
              </p>
            </div>
            <span className="text-xs font-bold text-muted-foreground">
              {lockedFollowedFansubs.length}{' '}{txa('kilitli')}
            </span>
          </div>

          {lockedFollowedFansubs.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-3">
              {lockedFollowedFansubs.map((fansub) => (
                <LockedFansubCard key={fansub.id} fansub={fansub} onClose={onClose} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-border/60 px-5 text-center">
              <p className="text-sm text-muted-foreground">
                {txa('Takip ettiğin tüm fansublarda destekçi etiketi açık veya kilitli takip bulunmuyor.')}
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="relative z-20 mt-5 shrink-0 overflow-visible rounded-2xl border border-primary/25 bg-primary/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
              <HeartHandshake className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-foreground">{txa('Takviyeyle daha fazlası mümkün')}</p>
              <p className="text-xs text-muted-foreground">
                {txa('Takviye yaptığın fansublar, profilindeki özel etiketlerin kaynağı olur.')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            aria-expanded={showHistory}
            aria-controls="profile-boost-history-popover"
            onClick={() => setShowHistory((value) => !value)}
            className="rounded-full bg-primary px-4 font-black text-primary-foreground hover:bg-primary/90"
          >
            <History className="mr-2 size-3.5" />
            {txa('Takviye Geçmişim')}
          </Button>
        </div>

        {showHistory ? (
          <div
            id="profile-boost-history-popover"
            role="region"
            aria-label={txa('Takviye geçmişi')}
            className="absolute bottom-[calc(100%+10px)] left-3 right-3 z-30 overflow-hidden rounded-[14px] border border-primary/25 bg-card/95 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-md sm:left-auto sm:w-[520px] sm:max-w-[calc(100%-1.5rem)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/55 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-black uppercase tracking-[0.16em] text-primary">{txa('Takviye geçmişi')}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{txa('Son destek kayıtları')}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={txa('Takviye geçmişini kapat')}
                onClick={() => setShowHistory(false)}
                className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-primary"
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="max-h-[220px] overflow-y-auto p-2">
              {historyLoading ? (
                <div className="flex min-h-[76px] items-center gap-2 rounded-[12px] border border-border/55 bg-background/45 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {txa('Takviye geçmişi yükleniyor...')}
                </div>
              ) : historyError ? (
                <div className="rounded-[12px] border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {historyError}
                </div>
              ) : historyItems.length > 0 ? (
                <div className="grid gap-2">
                  {historyItems.map((item) => (
                    <BoostHistoryRow key={item.id} item={item} onClose={onClose} />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[76px] items-center gap-2 rounded-[12px] border border-border/55 bg-background/45 px-3 py-2 text-sm text-muted-foreground">
                  <Zap className="size-4 shrink-0 text-primary" />
                  {txa('Henüz takviye geçmişin yok. Bir fansuba takviye verdiğinde burada listelenecek.')}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </PanelShell>
  )
}
