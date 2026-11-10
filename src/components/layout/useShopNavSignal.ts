import { useEffect, useState } from 'react'
import { fetchShopNavSignal, type ShopNavSignal } from '@/services/shopService'
import { txa } from '@/i18n/activeLocale'

/*
 * Signal for the sidebar Shop button: a live campaign, season, discount or deal of the day.
 * One request is shared across pages (module cache), refreshed every 10 minutes and at the end time.
 */

export type ShopNavBadge = {
  /** Butondaki kisa etiket. */
  label: string
  /** Altta gorunen aciklama (sidebar genisken). */
  detail: string
  endsAt: string | null
}

const REFRESH_MS = 10 * 60 * 1000

let cached: { at: number, value: ShopNavSignal | null } | null = null
let inflight: Promise<ShopNavSignal | null> | null = null

function load(force = false) {
  if (!force && cached && Date.now() - cached.at < REFRESH_MS) return Promise.resolve(cached.value)
  if (inflight) return inflight
  inflight = fetchShopNavSignal()
    .then((value) => value)
    .catch(() => null)
    .then((value) => {
      cached = { at: Date.now(), value }
      inflight = null
      return value
    })
  return inflight
}

const CAMPAIGN_LABEL: Record<string, string> = {
  sale: 'İndirim',
  limited: 'Sınırlı',
  launch: 'Yeni',
  event: 'Etkinlik',
}

/** Oncelik: kampanya > indirim > sezon > gunun firsati. */
export function resolveShopNavBadge(signal: ShopNavSignal | null): ShopNavBadge | null {
  if (!signal) return null
  if (signal.campaign) {
    return { label: txa(CAMPAIGN_LABEL[signal.campaign.kind] ?? 'Kampanya'), detail: signal.campaign.title, endsAt: signal.campaign.endsAt }
  }
  if (signal.discountPercent) {
    return { label: txa('%{v1}', { v1: signal.discountPercent }), detail: txa("%{percent}'e varan indirim", { percent: signal.discountPercent }), endsAt: signal.discountEndsAt }
  }
  if (signal.season) {
    return { label: txa('Sezon'), detail: signal.season.name, endsAt: signal.season.endsAt }
  }
  if (signal.dealPercent) {
    return { label: txa('%{v1}', { v1: signal.dealPercent }), detail: txa('Günün fırsatı'), endsAt: signal.dealEndsAt }
  }
  return null
}

export function useShopNavSignal() {
  const [signal, setSignal] = useState<ShopNavSignal | null>(cached?.value ?? null)
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const tick = (force: boolean) => {
      void load(force).then((value) => {
        if (cancelled) return
        setSignal(value)
        const badge = resolveShopNavBadge(value)
        const endsIn = badge?.endsAt ? new Date(badge.endsAt).getTime() - Date.now() : Number.POSITIVE_INFINITY
        // Bitis yakinsa o anda, degilse duzenli araliklarla tazele.
        timer = window.setTimeout(() => tick(true), Math.max(30_000, Math.min(REFRESH_MS, endsIn + 1_000)))
      })
    }
    tick(false)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [])
  return resolveShopNavBadge(signal)
}

/** Short time left such as "2d 4h", "5h 12m", "8m". */
export function formatShopNavRemaining(endsAt: string | null, now = Date.now()) {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return null
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return txa('{days}g {hours}s', { days, hours })
  if (hours > 0) return txa('{hours}s {minutes}dk', { hours, minutes: minutes % 60 })
  return txa('{minutes}dk', { minutes: Math.max(1, minutes) })
}
