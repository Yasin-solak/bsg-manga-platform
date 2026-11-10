import { useParams } from 'react-router-dom'
import { Link } from '@/i18n/router'
import { ArrowLeft } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { fetchShopSeason } from '@/services/shopService'
import { IstilaPanel, ISTILA_SEASON_SLUG } from './IstilaPanel'
import { ShopCountdown } from './ShopCountdown'
import { ShopShelf } from './ShopShelf'
import { formatDateTime, formatDay } from './shopFormat'
import { useShopQuery } from './useShopQuery'
import { txa } from '@/i18n/activeLocale'

/*
 * Season: a short banner header (a dark island in every theme; name / date / description on the left, countdown and
 * collection progress on the right), with the season bundle and pieces in the same grid below. With several batches
 * each has its own title; no scrolling, all pieces visible.
 */

export function ShopSeasonView() {
  const { slug = '' } = useParams()
  const { data, loading, error } = useShopQuery(`season:${slug}`, () => fetchShopSeason(slug))

  if (loading && !data) return <div className='h-[260px] animate-pulse rounded-[20px] bg-muted/40' />
  if (error) return <p className='rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground'>{error}</p>
  if (!data) {
    return (
      <div className='flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border px-6 py-16 text-center'>
        <span className='font-bold'>{txa('Bu sezon bulunamadı')}</span>
        <Link to='/magaza' className='text-[13px] font-bold underline underline-offset-4'>{txa('Vitrine dön')}</Link>
      </div>
    )
  }

  const { season } = data
  const banner = resolveStoreAssetUrl(season.banner)
  const bannerMobile = resolveStoreAssetUrl(season.bannerMobile) ?? banner
  const accent = season.accent ?? '#ffffff'
  const upcoming = new Date(season.startsAt).getTime() > Date.now()
  const multipleDrops = data.drops.length > 1

  return (
    <div className='flex flex-col gap-8' data-testid='shop-season'>
      <section className='dark relative isolate overflow-hidden rounded-[20px] border border-border bg-card text-foreground'>
        {banner && (
          <picture className='absolute inset-0 -z-20'>
            <source media='(max-width: 767px)' srcSet={bannerMobile} />
            <img src={banner} alt='' className='size-full object-cover object-[72%_50%]' />
          </picture>
        )}
        <span aria-hidden className='absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--card)_0%,color-mix(in_oklch,var(--card)_85%,transparent)_38%,color-mix(in_oklch,var(--card)_30%,transparent)_75%,color-mix(in_oklch,var(--card)_55%,transparent)_100%)]' />
        <div className='grid min-h-[230px] grid-cols-[minmax(0,1fr)_auto] items-end gap-8 p-7'>
          <div className='flex min-w-0 flex-col gap-3'>
            <Link to='/magaza' className='flex w-fit items-center gap-1.5 text-[12.5px] font-bold text-muted-foreground hover:text-foreground'><ArrowLeft weight='bold' size={12} />{txa('Vitrin')}</Link>
            <div className='flex flex-wrap gap-2'>
              <span className='rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-black' style={{ background: accent }}>{txa('Sezon')}</span>
              <span className='rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em]'>{formatDay(season.startsAt)} – {formatDay(season.endsAt)}</span>
            </div>
            <h1 className='text-[40px] font-black leading-none tracking-[-0.02em]'>{season.name}</h1>
            {(season.description ?? season.tagline) && <p className='line-clamp-2 max-w-[560px] text-[14px] leading-relaxed text-muted-foreground'>{season.description ?? season.tagline}</p>}
          </div>
          <div className='flex flex-col items-end gap-4'>
            <div className='flex flex-col items-end gap-1.5'>
              <span className='text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground'>{upcoming ? txa('Başlamasına') : txa('Sezonun bitmesine')}</span>
              <ShopCountdown target={upcoming ? season.startsAt : season.endsAt} />
            </div>
            {season.grantCount > 0 && (
              <div className='flex w-[260px] flex-col gap-1.5'>
                <span className='flex justify-between text-[12.5px]'><b>{txa('Koleksiyonun')}</b><span className='text-muted-foreground'>{txa('{v1} / {v2} parça sende', { v1: season.ownedCount, v2: season.grantCount })}</span></span>
                <span className='flex gap-1'>
                  {Array.from({ length: season.grantCount }, (_, index) => (
                    <span key={index} className='h-1.5 flex-1 rounded-full' style={{ background: index < season.ownedCount ? accent : 'rgba(255,255,255,0.14)' }} />
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {season.slug === ISTILA_SEASON_SLUG && <IstilaPanel />}

      {data.drops.map((drop, index) => (
        <section key={drop.startsAt} className='flex flex-col gap-3'>
          <div className='flex flex-wrap items-center gap-3'>
            <h2 className='text-[15px] font-black uppercase tracking-[0.08em]'>{multipleDrops ? `${index + 1}. parti` : txa('Sezon parçaları')}</h2>
            <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em]', drop.state === 'live' ? 'bg-foreground text-background' : 'bg-foreground/10 text-muted-foreground')}>
              {drop.state === 'live' ? txa('Satışta') : txa('Yakında')}
            </span>
            <span aria-hidden className='h-px flex-1 bg-border/70' />
            <span className='text-[12.5px] text-muted-foreground'>{drop.state === 'live' ? txa('{v1} açıldı', { v1: formatDay(drop.startsAt) }) : txa('{v1} açılır', { v1: formatDateTime(drop.startsAt) })}</span>
          </div>
          {/* Sezon paketi ilk partinin basinda, parcalarla ayni izgarada (yari bos ayri kutu yok). */}
          <ShopShelf title='' cards={index === 0 ? [...data.bundles, ...drop.items] : drop.items} wrap />
        </section>
      ))}
      {data.drops.length === 0 && data.bundles.length > 0 && <ShopShelf title={txa('Sezon paketi')} cards={data.bundles} wrap />}
    </div>
  )
}
