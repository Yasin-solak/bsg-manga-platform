import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { Clock, LockSimple } from '@phosphor-icons/react'
import type { FrameType } from '@components/common/AvatarFrame'
import { AvatarFrame } from '@components/common/AvatarFrame'
import FansubSupporterAssetMedia from '@/components/community/FansubSupporterAssetMedia'
import { useAuth } from '@/contexts/AuthContext'
import { buildNameTextStyleVars, getNameTextStyleClassName, type NameTextColorId, type NameTextEffectId } from '@/data/nameTextEffects'
import { getDefaultFansubSupporterAssetPresentation, normalizeFansubSupporterAssetPresentation } from '@/lib/fansubSupporterAssetPresentation'
import { nameEffectId, type NameEffect } from '@/lib/nameEffectRegistry'
import { cn } from '@/lib/utils'
import ProfileIdentityShowcase from '@/pages/profile/ProfileIdentityShowcase'
import type { MockUser } from '@/pages/profile/types'
import { listLatestChaptersWithFansub, type LatestChapterItem } from '@/services/latestChapterFeedService'
import type { PremiumShowcaseExpression } from '@/services/shopService'
import { premiumNameLook, SHOP_PREMIUM_DEMO_BACKGROUND, type PremiumLook } from './shopPremiumShowcase'
import type { ShopViewer } from './shopViewer'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Real parts of the Premium page:
 * - The reader's profile showcase (ProfileIdentityShowcase: same rendering as the profile page), live with the
 * chosen name effect / color / hover theme.
 * - Name effects gallery: published animated effects with the reader's own name.
 * - Fansub expressions: real emoji / stickers uploaded by fansubs.
 * - Early access: real recently published chapters; hours premium and standard readers could read.
 */

const SOURCE_W = 360
const SOURCE_H = 640

/** Okurun profil vitrini; premium kapaliyken standart okurun gordugu hali. */
export function PremiumProfilePreview({ viewer, look, scale = 1 }: { viewer: ShopViewer, look: PremiumLook | null, scale?: number }) {
  const { currentUser } = useAuth()
  const user = useMemo<MockUser>(() => ({
    id: currentUser?.id,
    username: viewer.username,
    displayName: viewer.name,
    avatar: viewer.avatar,
    frameType: (currentUser?.frameType || 'default') as FrameType,
    bio: txa('Shonen ve seinen okuru. Haftalık bölümleri kaçırmam.'),
    joinDate: '',
    level: '',
    isPremiumActive: Boolean(look),
    stats: { reading: 0, followers: 0 },
    badges: [],
    socialLinks: [],
    following: [],
    readingHistory: [],
    followingFansubs: [],
    ownedFrames: [],
    ownedBackgrounds: [],
    activityFeed: [],
  }), [currentUser?.frameType, currentUser?.id, look, viewer])
  const name = premiumNameLook(look)
  return (
    <div className='overflow-hidden rounded-[24px] shadow-[0_60px_120px_-60px_rgba(0,0,0,0.95)] ring-1 ring-border/70' style={{ width: SOURCE_W * scale, height: SOURCE_H * scale }} data-premium-profile-preview={look ? 'premium' : 'standard'}>
      <div style={{ width: SOURCE_W, height: SOURCE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <ProfileIdentityShowcase
          canViewProfileStats={false}
          className='pointer-events-none'
          currentUserExists
          effectiveBg={look ? { id: 'premium-demo', label: txa('Kendi arka planın'), background: SHOP_PREMIUM_DEMO_BACKGROUND.videoUrl, mediaType: 'video', origin: 'upload' } : null}
          effectiveFrame={user.frameType}
          isFollowing={false}
          isMutual={false}
          isOwnProfile
          ownedBadges={[]}
          profileHeaderNameClassName={name.className}
          profileHeaderNameInlineStyle={name.style}
          themeColors={look?.theme ?? null}
          user={user}
          variant='editor'
        />
      </div>
    </div>
  )
}

/** Yayindaki animasyonlu isim efektleri okurun kendi adiyla; tiklayinca ustteki profilde denenir. */
export function PremiumEffectGallery({ effects, viewer, colorId, selected, onSelect, columns = 3 }: {
  effects: NameEffect[]
  viewer: ShopViewer
  colorId: NameTextColorId
  selected: NameTextEffectId
  onSelect: (effectId: NameTextEffectId) => void
  columns?: 2 | 3
}) {
  return (
    <div className={cn('grid gap-4', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {effects.map((effect) => {
        const id = nameEffectId(effect.slug)
        const active = selected === id
        return (
          <button
            key={effect.slug}
            type='button'
            onClick={() => onSelect(id)}
            aria-pressed={active}
            className={cn('group flex flex-col overflow-hidden rounded-[22px] border bg-card text-left transition-colors', active ? 'border-foreground' : 'border-border/70 hover:border-foreground/30')}
            data-premium-effect={effect.slug}
          >
            <span className={cn('flex items-center justify-center overflow-hidden bg-[#07080b] px-8', columns === 2 ? 'h-[128px]' : 'h-[150px]')}>
              <span className={getNameTextStyleClassName({ effectId: id, colorId, fontId: 'display' })} style={{ ...buildNameTextStyleVars(colorId, colorId), fontSize: columns === 2 ? 32 : 38 }}>{viewer.name}</span>
            </span>
            <span className='flex items-center justify-between gap-3 px-4 py-3'>
              <span className='min-w-0'>
                <span className='block text-[15px] font-extrabold'>{effect.name}</span>
                {effect.description && <span className='block truncate text-[12.5px] text-muted-foreground'>{effect.description}</span>}
              </span>
              <span className={cn('flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold', active ? 'bg-foreground text-background' : 'bg-accent')}>{active ? txa('Deneniyor') : txa('Dene')}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Real emoji / stickers uploaded by fansubs and a sample comment with them. */
export function PremiumExpressions({ items, viewer, look }: { items: PremiumShowcaseExpression[], viewer: ShopViewer, look: PremiumLook }) {
  const emojis = items.filter((item) => item.assetKind === 'emoji')
  const stickers = items.filter((item) => item.assetKind === 'sticker')
  const name = premiumNameLook(look)
  const media = (item: PremiumShowcaseExpression, className: string) => (
    <FansubSupporterAssetMedia
      key={item.id}
      asset={{ assetKind: item.assetKind, assetRef: item.assetRef, label: item.label, presentation: normalizeFansubSupporterAssetPresentation(item.presentation ?? getDefaultFansubSupporterAssetPresentation(item.assetKind), item.assetKind) }}
      className={cn('inline-block bg-transparent align-middle', className)}
      imageClassName='object-contain'
    />
  )
  if (!items.length) return <p className='text-[13.5px] text-muted-foreground'>{txa('Fansublar ifade yükledikçe burada görünür.')}</p>
  return (
    <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6'>
      <div className='flex flex-col gap-3 rounded-[22px] border border-border/70 bg-card p-5'>
        <span className='text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground'>{txa('Yorumda böyle görünür')}</span>
        <div className='flex gap-3'>
          <AvatarFrame src={viewer.avatar} alt={viewer.name} frameType='default' size={44} hoverPlayback='never' disableStoreLookup />
          <div className='min-w-0 flex-1'>
            <span className={cn('text-[15px]', name.className)} style={name.style}>{viewer.name}</span>
            <div className='mt-1 flex flex-wrap items-center gap-1 text-[14px] text-foreground/85'>
              {txa('Bu bölüm efsaneydi')} {emojis.slice(0, 3).map((item) => media(item, 'size-7'))}
            </div>
            {stickers[0] && <div className='mt-2 flex gap-2'>{stickers.slice(0, 2).map((item) => media(item, 'size-28'))}</div>}
          </div>
        </div>
      </div>
      <div className='grid grid-cols-4 gap-3' data-premium-expressions>
        {items.slice(0, 8).map((item) => (
          <span key={item.id} className='flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-card p-3 text-center'>
            {media(item, item.assetKind === 'sticker' ? 'size-16' : 'size-12')}
            <span className='w-full truncate text-[11.5px] font-bold'>{item.label}</span>
            <span className='w-full truncate text-[10.5px] text-muted-foreground'>{item.fansubName}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function formatHour(value: number) {
  return new Date(value).toLocaleString(intlLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Real recently published chapters: when a premium reader, and when a standard reader, could read. */
export function PremiumEarlyAccess({ delayHours }: { delayHours: number }) {
  const [items, setItems] = useState<LatestChapterItem[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void listLatestChaptersWithFansub(4).then((list) => { if (!cancelled) setItems(list) }).catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [])
  const now = Date.now()
  if (items === null) return <div className='h-48 animate-pulse rounded-[22px] bg-muted/40' />
  if (!items.length) return <p className='text-[13.5px] text-muted-foreground'>{txa('Yeni bölüm yayınlandığında burada görünür.')}</p>
  return (
    <div className='overflow-hidden rounded-[22px] border border-border/70 bg-card' data-premium-early>
      <div className='grid grid-cols-[minmax(0,1fr)_128px_150px] border-b border-border/70 px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground'>
        <span>{txa('Son bölümler')}</span><span>{txa('Premium okur')}</span><span>{txa('Standart okur')}</span>
      </div>
      {items.map((item) => {
        const publishedAt = item.publishAt ? new Date(item.publishAt).getTime() : null
        const publicAt = publishedAt === null ? null : publishedAt + delayHours * 3_600_000
        const earlyNow = publishedAt !== null && publicAt !== null && now >= publishedAt && now < publicAt
        return (
          <Link key={item.chapterId} to={item.mangaSlug ? `/manga/${item.mangaSlug}` : `/manga/${item.mangaId}`} className='grid grid-cols-[minmax(0,1fr)_128px_150px] items-center gap-0 border-b border-border/50 px-5 py-3 text-inherit last:border-b-0 hover:bg-accent/40'>
            <span className='flex min-w-0 items-center gap-3'>
              <img src={item.mangaCoverImage} alt='' loading='lazy' className='h-14 w-10 flex-none rounded-md object-cover' />
              <span className='min-w-0'>
                <span className='block truncate text-[14px] font-bold'>{item.mangaTitle}</span>
                <span className='block truncate text-[12.5px] text-muted-foreground'>{txa('Bölüm {number}', { number: item.chapterNumber })}{item.fansubName ? ` · ${item.fansubName}` : ''}</span>
              </span>
            </span>
            <span className='text-[13px] font-bold'>{publishedAt ? formatHour(publishedAt) : '—'}</span>
            <span className='flex items-center gap-1.5 text-[13px] text-muted-foreground'>
              {earlyNow && <LockSimple size={13} />}{publicAt ? formatHour(publicAt) : '—'}
              {earlyNow && <span className='rounded-full bg-foreground px-2 py-0.5 text-[10.5px] font-bold text-background'>{txa('şu an yalnız Premium')}</span>}
            </span>
          </Link>
        )
      })}
      <div className='flex items-center gap-2 px-5 py-3 text-[12.5px] text-muted-foreground'><Clock size={13} />{txa('Premium okur yeni bölümü yayınlandığı an okur; standart okur {v1} saat sonra.', { v1: delayHours })}</div>
    </div>
  )
}
