import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Coins, Crown, Gift, Lightning, Minus } from '@phosphor-icons/react'
import { HOVER_THEME_PRESETS } from '@/components/common/HoverThemePicker'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useAuth } from '@/contexts/AuthContext'
import { ACTIVE_NAME_TEXT_COLORS, type NameTextColorId, type NameTextEffectId } from '@/data/nameTextEffects'
import { PREMIUM_PERK_GROUPS, PREMIUM_PERKS, type PremiumPerkGroup, type PremiumPerkKey } from '@/data/premiumPerks'
import { nameEffectId, useNameEffects } from '@/lib/nameEffectRegistry'
import { usePremiumPerks } from '@/lib/premiumPerks'
import { cn } from '@/lib/utils'
import { getPublicUnlockDelayHours } from '@/services/premiumPackagePublicService'
import { fetchPremiumShowcaseExpressions, fetchShopStorefront, type ShopCard } from '@/services/shopService'
import { toast } from '@/services/toastService'
import { PREMIUM_PERK_ICONS } from './premiumPerkIcons'
import { PremiumEarlyAccess, PremiumEffectGallery, PremiumExpressions, PremiumProfilePreview } from './ShopPremiumParts'
import { ShopPurchaseDialog } from './ShopPurchaseDialog'
import { ShopShelf } from './ShopShelf'
import { ShopThumb } from './ShopThumb'
import { formatCoin, formatDateTime } from './shopFormat'
import type { PremiumLook } from './shopPremiumShowcase'
import { useShopViewer } from './shopViewer'
import { useShopQuery } from './useShopQuery'
import { txa } from '@/i18n/activeLocale'

/*
 * Premium (inspired by the Discord Nitro page): a big-title intro + the reader's real profile showcase
 * (Standard / Premium comparison, trying effect / color / theme), two plan cards (Standard and
 * Premium), bento cards for shop perks, alternating "Best of Premium" sections
 * (name effects, early access, profile, fansub expressions), a monthly set, grouped comparison, FAQ and
 * a final call. Only perks ON in Shop Control are described. One plan: 30 days. The price comes from the
 * shop v3 premium product; purchase through ShopPurchaseDialog. Surfaces are neutral; color comes from content.
 */

const COLOR_CHOICES: NameTextColorId[] = ['gold', 'cyan', 'pink', 'violet', 'neutral', 'copper']

// Monthly Premium set: premium_month campaigns and Premium-only products.
function monthlyPremiumSet(data: Awaited<ReturnType<typeof fetchShopStorefront>> | null): ShopCard[] {
  if (!data) return []
  const campaigns = [data.hero, ...data.rows].filter((campaign) => campaign?.kind === 'premium_month')
  const pool = [
    ...campaigns.flatMap((campaign) => campaign?.products ?? []),
    ...[...data.rows.flatMap((row) => row.products), ...data.newArrivals].filter((card) => card.quote.reason === 'premium_only'),
  ]
  const seen = new Set<string>()
  return pool.filter((card) => {
    if (seen.has(card.id) || card.kind === 'premium') return false
    seen.add(card.id)
    return true
  })
}

// Nitro basliklari: kalin, italik, buyuk harf.
function Display({ children, className, as: Tag = 'h2' }: { children: ReactNode, className?: string, as?: 'h1' | 'h2' | 'h3' }) {
  return <Tag className={cn('font-black uppercase italic leading-[0.92] tracking-[-0.02em]', className)}>{children}</Tag>
}

function PriceAndActions({ card, loading, active, onBuy, onGift, compact = false }: { card: ShopCard | null, loading: boolean, active: boolean, onBuy: () => void, onGift: () => void, compact?: boolean }) {
  if (loading && !card) return <span className='h-12 w-64 animate-pulse rounded-xl bg-muted/50' />
  if (!card) return <span className='text-[14px] text-muted-foreground'>{txa('Premium şu anda satışta değil.')}</span>
  return (
    <div className={cn('flex flex-wrap items-center gap-4', compact && 'flex-col items-stretch gap-3')} data-shop-premium-cta>
      <span className='flex items-baseline gap-1.5'>
        <span className={cn('font-black tabular-nums leading-none', compact ? 'text-[30px]' : 'text-[36px]')}>{formatCoin(card.quote.price)}</span>
        <span className='text-[14px] font-bold text-muted-foreground'>{txa('Coin / {v1} gün', { v1: card.premiumDays ?? 30 })}</span>
        {card.quote.price < card.quote.listPrice && <span className='text-[14px] tabular-nums text-muted-foreground line-through'>{formatCoin(card.quote.listPrice)}</span>}
      </span>
      <span className={cn('flex gap-2', compact && 'w-full')}>
        <button type='button' disabled={!card.quote.purchasable} onClick={onBuy} className={cn('h-12 rounded-xl bg-foreground px-6 text-[14.5px] font-extrabold text-background disabled:opacity-45', compact && 'flex-1')} data-shop-premium-buy>
          {active ? txa('Süreyi uzat') : txa('Premium’a geç')}
        </button>
        <button type='button' disabled={!card.quote.purchasable} onClick={onGift} className='flex h-12 items-center gap-2 rounded-xl border border-border bg-transparent px-4 text-[14px] font-bold hover:bg-accent disabled:opacity-45'>
          <Gift size={16} />{txa('Hediye et')}
        </button>
      </span>
    </div>
  )
}

function Chip({ active, onClick, children, swatch }: { active: boolean, onClick: () => void, children: ReactNode, swatch?: string }) {
  return (
    <button type='button' onClick={onClick} aria-pressed={active} className={cn('flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-colors', active ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-transparent text-muted-foreground hover:text-foreground')}>
      {swatch && <span className='size-3 rounded-full ring-1 ring-white/30' style={{ background: swatch }} />}
      {children}
    </button>
  )
}

// Best of Premium: text on one side, a large image on the other (order alternates).
function Feature({ title, body, visual, flip, id }: { title: ReactNode, body: ReactNode, visual: ReactNode, flip?: boolean, id: string }) {
  return (
    <section className={cn('grid items-center gap-10', flip ? 'grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]')} data-premium-feature={id}>
      <div className={cn('flex flex-col gap-4', flip && 'order-2')}>
        <Display className='text-[34px]'>{title}</Display>
        <div className='text-[15px] leading-relaxed text-foreground/70'>{body}</div>
      </div>
      <div className={cn('min-w-0 rounded-[28px] border border-border/70 bg-card p-5', flip && 'order-1')}>{visual}</div>
    </section>
  )
}

function BentoCard({ title, body, visual, perk, wide = false }: { title: string, body: string, visual: ReactNode, perk: PremiumPerkKey, wide?: boolean }) {
  return (
    <article className={cn('rounded-[28px] border border-border/70 bg-card p-4', wide ? 'grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-8 pr-10' : 'flex flex-col gap-4 pb-6')} data-premium-bento={perk}>
      <div className='relative flex h-[190px] items-center justify-center overflow-hidden rounded-[20px] bg-[radial-gradient(circle_at_50%_30%,color-mix(in_oklch,var(--foreground)_12%,transparent),color-mix(in_oklch,var(--foreground)_3%,transparent)_70%)]'>{visual}</div>
      <div className='flex flex-col gap-2 px-2'>
        <Display as='h3' className='text-[24px]'>{title}</Display>
        <p className='text-[14px] leading-relaxed text-foreground/70'>{body}</p>
      </div>
    </article>
  )
}

const FAQ_BASE = [
  { get q() { return txa('Premium ne kadar sürer?') }, get a() { return txa('Tek plan var: 30 gün. Premium aktifken tekrar alırsan yeni süre mevcut sürenin sonuna eklenir.') } },
  { get q() { return txa('Süre bitince ne olur?') }, get a() { return txa('Premium ayrıcalıkları kapanır; isim stilin, kendi arka planın ve teman standart haline döner, kayıtlı seçimlerin silinmez. Mağazadan aldığın çerçeve ve efektler sende kalır.') } },
  { get q() { return txa('Premium hediye edebilir miyim?') }, get a() { return txa('Evet. “Hediye et” ile bir okuru seçip Premium gönderebilirsin; süre onun hesabına eklenir.') } },
  { get q() { return txa('Ödeme nasıl yapılıyor?') }, get a() { return txa('Premium Coin ile alınır. Coin; görevler, okuma serisi ve kodlarla kazanılır. Gerçek para ile ödeme yoktur.') } },
]

export function ShopPremiumView() {
  const { currentUser } = useAuth()
  const viewer = useShopViewer()
  const effects = useNameEffects()
  const perks = usePremiumPerks()
  const { data, loading, reload } = useShopQuery('storefront', fetchShopStorefront)
  const expressions = useShopQuery('premium-expressions', () => fetchPremiumShowcaseExpressions(12))
  const [dialog, setDialog] = useState<'self' | 'gift' | null>(null)
  const [delayHours, setDelayHours] = useState<number | null>(null)
  const [premiumView, setPremiumView] = useState(true)
  const [effectId, setEffectId] = useState<NameTextEffectId | null>(null)
  const [colorId, setColorId] = useState<NameTextColorId>('gold')
  const [themeId, setThemeId] = useState(HOVER_THEME_PRESETS[0].id)
  const heroRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    void getPublicUnlockDelayHours().then((hours) => setDelayHours(typeof hours === 'number' ? hours : null)).catch(() => setDelayHours(null))
  }, [])

  const on = perks.isEnabled
  const effectsOn = on('name_style') && on('name_effects') && effects.length > 0
  const activeEffect: NameTextEffectId = effectId ?? (effectsOn && effects[0] ? nameEffectId(effects[0].slug) : 'gradient')
  const theme = HOVER_THEME_PRESETS.find((preset) => preset.id === themeId) ?? HOVER_THEME_PRESETS[0]
  const look: PremiumLook = { effectId: activeEffect, colorId, theme: on('hover_theme') ? theme : null }
  const card = data?.premium ?? null
  const monthly = useMemo(() => monthlyPremiumSet(data), [data])
  const sample = useMemo(() => data?.newArrivals.find((entry) => entry.kind !== 'premium' && entry.quote.listPrice > 0) ?? null, [data])
  const active = viewer.isPremium
  const hours = perks.value('early_access') ?? delayHours ?? 36
  const memberPercent = perks.value('member_pricing') ?? 15
  const bonusPercent = perks.value('coin_bonus') ?? 25
  const shopEarlyHours = perks.value('shop_early_access') ?? 24
  const enabledPerks = PREMIUM_PERKS.filter((perk) => on(perk.key))

  const perkLine = (key: PremiumPerkKey) => {
    if (key === 'early_access') return txa('Yeni bölümlere {v1} saat erken erişim', { v1: hours })
    if (key === 'member_pricing') return txa('Mağazada %{v1} üye fiyatı', { v1: memberPercent })
    if (key === 'coin_bonus') return txa('Görev ve seri ödüllerinde +%{v1} Coin', { v1: bonusPercent })
    if (key === 'shop_early_access') return txa('Yeni ürünlere {v1} saat erken erişim', { v1: shopEarlyHours })
    return PREMIUM_PERKS.find((perk) => perk.key === key)?.label ?? key
  }

  const open = (mode: 'self' | 'gift') => {
    if (!currentUser) {
      toast.info(txa('Premium için giriş yapmalısın.'))
      return
    }
    setDialog(mode)
  }

  const tryEffect = (next: NameTextEffectId) => {
    setEffectId(next)
    setPremiumView(true)
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const bento = [
    on('member_pricing') && (
      <BentoCard
        key='member'
        perk='member_pricing'
        title={txa('Her şey daha ucuz')}
        body={txa('Çerçeve, efekt ve paketlerde Premium üyeye %{v1} indirim. Başka bir indirim daha ucuzsa o uygulanır; asla üst üste binmez.', { v1: memberPercent })}
        visual={sample ? (
          <div className='flex items-center gap-5'>
            <ShopThumb card={sample} className='size-28 rounded-2xl ring-1 ring-border/60' fit='contain' />
            <span className='flex flex-col gap-1'>
              <span className='text-[18px] tabular-nums text-muted-foreground line-through'>{txa('{v1} Coin', { v1: formatCoin(sample.quote.listPrice) })}</span>
              <span className='text-[40px] font-black tabular-nums leading-none'>{formatCoin(Math.max(1, Math.round((sample.quote.listPrice * (100 - memberPercent)) / 1000) * 10))}</span>
              <span className='flex items-center gap-1 text-[12.5px] font-bold'><Crown weight='fill' size={13} />{txa('Premium fiyatı')}</span>
            </span>
          </div>
        ) : <span className='text-[64px] font-black italic'>{txa('-%{v1}', { v1: memberPercent })}</span>}
      />
    ),
    on('coin_bonus') && (
      <BentoCard
        key='bonus'
        perk='coin_bonus'
        title={txa('Daha fazla Coin')}
        body={txa('Görev, okuma serisi ve etkinlik ödüllerinde her seferinde +%{v1} Coin. Bonus ödülü aldığın an hesabına eklenir.', { v1: bonusPercent })}
        visual={(
          <span className='flex items-center gap-4'>
            <span className='flex flex-col items-center'><span className='text-[40px] font-black tabular-nums text-muted-foreground'>40</span><span className='text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground'>{txa('Standart')}</span></span>
            <ArrowRight weight='bold' size={26} className='text-muted-foreground' />
            <span className='flex flex-col items-center'><span className='flex items-center gap-2 text-[56px] font-black tabular-nums leading-none'><Coins weight='fill' size={40} />{40 + Math.ceil((40 * bonusPercent) / 100)}</span><span className='text-[11px] font-bold uppercase tracking-[0.1em]'>{txa('Premium')}</span></span>
          </span>
        )}
      />
    ),
    on('shop_early_access') && (
      <BentoCard
        key='shop-early'
        perk='shop_early_access'
        title={txa('Yenilere ilk sen')}
        body={txa('Planlanan çerçeve ve efektler satışa çıkmadan {v1} saat önce Premium üyelere açılır.', { v1: shopEarlyHours })}
        visual={<span className='flex items-center gap-3'><Lightning weight='fill' size={64} /><span className='text-[48px] font-black italic leading-none'>{shopEarlyHours}{' '}{txa('SAAT')}<br /><span className='text-[22px] text-muted-foreground'>{txa('önce')}</span></span></span>}
      />
    ),
    on('premium_exclusives') && (
      <BentoCard
        key='exclusives'
        perk='premium_exclusives'
        title={txa('Yalnız Premium’a')}
        body={txa('Bazı çerçeve ve efektler yalnız Premium üyelere satılır; her ay yenileri gelir.')}
        visual={monthly.length ? (
          <span className='flex gap-3'>{monthly.slice(0, 3).map((entry) => <ShopThumb key={entry.id} card={entry} className='size-24 rounded-2xl ring-1 ring-border/60' fit='contain' />)}</span>
        ) : <Crown weight='fill' size={96} />}
      />
    ),
  ].filter((entry): entry is JSX.Element => Boolean(entry))
  // Tek avantaj aciksa kart yatay (bos gorunmesin).
  const bentoCards = bento.length === 1 ? [{ ...bento[0], props: { ...bento[0].props, wide: true } }] : bento

  const features: Array<{ id: string, title: ReactNode, body: ReactNode, visual: ReactNode }> = []
  if (effectsOn) {
    features.push({
      id: 'effects',
      title: <>{txa('Adın, kendi')}<br />{txa('sahnesiyle')}</>,
      body: <>{txa('Yorumlarda, profilinde ve kartında adının etrafında canlı alev, şimşek, sakura… Birini seç; yukarıdaki profilinde dene.')}</>,
      visual: <PremiumEffectGallery effects={effects} viewer={viewer} colorId={colorId} selected={activeEffect} onSelect={tryEffect} columns={2} />,
    })
  }
  if (on('early_access')) {
    features.push({
      id: 'early',
      title: <>{txa('Herkesten')}<br />{txa('{v1} saat önce', { v1: hours })}</>,
      body: <>{txa('Yeni bölüm yayınlandığı an Premium okura açılır; standart okur {v1} saat bekler. Aşağıdakiler sitedeki son bölümler.', { v1: hours })}</>,
      visual: <PremiumEarlyAccess delayHours={hours} />,
    })
  }
  if (on('custom_background') || on('hover_theme')) {
    features.push({
      id: 'profile',
      title: <>{txa('Profilini')}<br />{txa('kendin yap')}</>,
      body: (
        <ul className='flex flex-col gap-2'>
          {on('custom_background') && <li className='flex gap-2'><Check weight='bold' size={16} className='mt-1 flex-none' />{txa('Profiline kendi görselini ya da videonu koy.')}</li>}
          {on('hover_theme') && <li className='flex gap-2'><Check weight='bold' size={16} className='mt-1 flex-none' />{txa('Adının üstüne gelindiğinde açılan kart senin renklerinde.')}</li>}
          {on('name_style') && <li className='flex gap-2'><Check weight='bold' size={16} className='mt-1 flex-none' />{txa('Adın için yazı tipi ve renk seç.')}</li>}
        </ul>
      ),
      visual: (
        <div className='grid grid-cols-3 gap-3' data-premium-themes>
          {HOVER_THEME_PRESETS.slice(0, 6).map((preset) => (
            <button
              key={preset.id}
              type='button'
              onClick={() => { setThemeId(preset.id); setPremiumView(true); heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              className={cn('flex h-[104px] flex-col justify-end rounded-2xl p-3 text-left text-white ring-1 transition', themeId === preset.id ? 'ring-foreground' : 'ring-white/10 hover:ring-white/40')}
              style={{ background: `linear-gradient(135deg, ${preset.mainColor}, ${preset.accentColor})` }}
            >
              <span className='truncate text-[14px] font-extrabold drop-shadow'>{viewer.name}</span>
              <span className='text-[11.5px] font-semibold text-white/75'>{preset.name}</span>
            </button>
          ))}
        </div>
      ),
    })
  }
  if (on('fansub_expressions')) {
    features.push({
      id: 'expressions',
      title: <>{txa('Ekiplerin')}<br />{txa('kendi emojileri')}</>,
      body: <>{txa('Fansubların yüklediği emoji ve çıkartmalarla her yerde yorum yap. Aşağıdakiler sitedeki gerçek ifadeler.')}</>,
      visual: <PremiumExpressions items={expressions.data ?? []} viewer={viewer} look={look} />,
    })
  }

  const groups = (Object.keys(PREMIUM_PERK_GROUPS) as PremiumPerkGroup[])
    .map((group) => ({ group, rows: enabledPerks.filter((perk) => perk.group === group) }))
    .filter((entry) => entry.rows.length > 0)

  return (
    <div className='flex flex-col gap-20' data-testid='shop-premium'>
      {/* Giris (Nitro gibi ortali buyuk baslik) */}
      <section className='relative isolate flex flex-col items-center gap-6 overflow-hidden rounded-[32px] border border-border/70 bg-card px-10 py-14 text-center'>
        <Crown weight='fill' aria-hidden size={460} className='absolute -left-28 -top-32 -z-10 text-foreground/[0.03]' />
        <Crown weight='fill' aria-hidden size={300} className='absolute -bottom-24 -right-16 -z-10 rotate-12 text-foreground/[0.03]' />
        <span className='flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-background'>
          <Crown weight='fill' size={12} />{txa('Premium')}
        </span>
        <Display as='h1' className='text-[60px]'>{txa('BSG’nin en iyisinin')}<br />{txa('kilidini aç')}</Display>
        <p className='max-w-[560px] text-[16px] leading-relaxed text-foreground/70'>
          {txa('Varsayılanla yetinme. Premium ile adın, profilin ve okuma deneyimin bir üst seviyeye çıkar; mağazada da kazandırır.')}
        </p>
        {active && currentUser?.premiumExpiresAt && (
          <span className='rounded-xl bg-foreground/10 px-3 py-2 text-[13px]'>{txa('Premium’un')} <b>{formatDateTime(currentUser.premiumExpiresAt)}</b> {txa('tarihine kadar aktif.')}</span>
        )}
        <PriceAndActions card={card} loading={loading} active={active} onBuy={() => open('self')} onGift={() => open('gift')} />
        <ul className='flex max-w-[720px] flex-wrap justify-center gap-2'>
          {enabledPerks.map((perk) => {
            const PerkIcon = PREMIUM_PERK_ICONS[perk.key]
            return <li key={perk.key} className='flex h-8 items-center gap-1.5 rounded-full bg-foreground/[0.07] px-3 text-[12.5px] font-semibold'><PerkIcon weight='fill' size={14} />{perk.label}</li>
          })}
        </ul>
      </section>

      {/* Kendinde dene: okurun gercek profil vitrini, Standart / Premium ve secimler */}
      <section ref={heroRef} className='grid scroll-mt-24 grid-cols-[minmax(0,1fr)_380px] items-center gap-10' data-premium-tryon-section>
        <div className='flex min-w-0 flex-col gap-5'>
          <Display className='text-[38px]'>{txa('Kendinde dene')}</Display>
          <p className='text-[15px] leading-relaxed text-foreground/70'>
            {txa('Yandaki')} {viewer.isGuest ? txa('profil, giriş yapınca seninki olur') : txa('senin profilin')}. {txa('Bir efekt, renk ya da tema seç; Premium ile tam olarak böyle görünür. Standart’a geçip farkı gör.')}
          </p>
          <div className='flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5' data-premium-tryon>
            {effectsOn && (
              <div className='flex flex-col gap-2'>
                <span className='text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>{txa('İsim efekti')}</span>
                <div className='flex flex-wrap gap-1.5'>
                  {effects.map((effect) => (
                    <Chip key={effect.slug} active={activeEffect === nameEffectId(effect.slug)} onClick={() => { setEffectId(nameEffectId(effect.slug)); setPremiumView(true) }}>{effect.name}</Chip>
                  ))}
                </div>
              </div>
            )}
            {on('name_style') && (
              <div className='flex flex-col gap-2'>
                <span className='text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>{txa('İsim rengi')}</span>
                <div className='flex flex-wrap gap-1.5'>
                  {COLOR_CHOICES.map((value) => {
                    const color = ACTIVE_NAME_TEXT_COLORS.find((entry) => entry.id === value)
                    return color ? <Chip key={value} active={colorId === value} onClick={() => { setColorId(value); setPremiumView(true) }}>{color.name}</Chip> : null
                  })}
                </div>
              </div>
            )}
            {on('hover_theme') && (
              <div className='flex flex-col gap-2'>
                <span className='text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>{txa('Kart teması')}</span>
                <div className='flex flex-wrap gap-1.5'>
                  {HOVER_THEME_PRESETS.slice(0, 6).map((preset) => (
                    <Chip key={preset.id} active={themeId === preset.id} onClick={() => { setThemeId(preset.id); setPremiumView(true) }} swatch={`linear-gradient(135deg, ${preset.mainColor}, ${preset.accentColor})`}>{preset.name}</Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className='flex flex-col items-center gap-4'>
          <PremiumProfilePreview viewer={viewer} look={premiumView ? look : null} scale={1} />
          <div className='flex gap-1 rounded-xl border border-border/70 bg-background p-1' role='radiogroup' aria-label={txa('Karşılaştır')} data-shop-premium-compare>
            {([[false, txa('Standart')], [true, txa('Premium')]] as const).map(([value, label]) => (
              <button key={label} type='button' role='radio' aria-checked={premiumView === value} onClick={() => setPremiumView(value)} className={cn('h-9 rounded-lg px-6 text-[13px] font-bold transition-colors', premiumView === value ? 'bg-foreground text-background' : 'bg-transparent text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Planlar (Nitro Basic / Nitro gibi) */}
      <section className='grid grid-cols-2 gap-6' data-premium-plans>
        <article className='flex flex-col gap-6 rounded-[28px] border border-border/70 bg-card p-8'>
          <div className='flex flex-col gap-2'>
            <Display as='h3' className='text-[30px]'>{txa('Standart')}</Display>
            <p className='text-[14px] text-foreground/70'>{txa('Herkese açık, ücretsiz.')}</p>
          </div>
          <span className='flex h-12 items-center justify-center rounded-xl border border-border/70 text-[14px] font-bold text-muted-foreground'>{active ? txa('Premium’un bitince') : txa('Şu anki planın')}</span>
          <ul className='flex flex-col gap-3 border-t border-border/60 pt-6 text-[14.5px]'>
            {[txa('Tüm bölümleri okuma'), txa('Yorum, liste ve topluluk'), txa('Görevlerle Coin kazanma'), txa('Mağazadan çerçeve ve efekt alma')].map((line) => (
              <li key={line} className='flex items-center gap-2.5'><Check weight='bold' size={16} />{line}</li>
            ))}
            {on('early_access') && <li className='flex items-center gap-2.5 text-muted-foreground'><Minus size={16} />{txa('Yeni bölümler {v1} saat sonra', { v1: hours })}</li>}
          </ul>
        </article>
        <article className='flex flex-col gap-6 rounded-[28px] border-2 border-foreground/80 bg-card p-8 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.9)]'>
          <div className='flex flex-col gap-2'>
            <Display as='h3' className='flex items-center gap-2 text-[30px]'><Crown weight='fill' size={28} />{txa('Premium')}</Display>
            <p className='text-[14px] text-foreground/70'>{txa('Tüm ayrıcalıklar, {v1} gün.', { v1: card?.premiumDays ?? 30 })}</p>
          </div>
          <PriceAndActions card={card} loading={loading} active={active} onBuy={() => open('self')} onGift={() => open('gift')} compact />
          <div className='flex flex-col gap-3 border-t border-border/60 pt-6'>
            <span className='text-[14px] font-extrabold'>{txa('Standart’taki her şey, artı:')}</span>
            <ul className='flex flex-col gap-3 text-[14.5px]'>
              {enabledPerks.map((perk) => {
                const PerkIcon = PREMIUM_PERK_ICONS[perk.key]
                return <li key={perk.key} className='flex items-center gap-2.5'><PerkIcon weight='fill' size={17} className='flex-none' />{perkLine(perk.key)}</li>
              })}
            </ul>
          </div>
        </article>
      </section>

      {bento.length > 0 && (
        <section className='flex flex-col gap-6'>
          <Display className='text-center text-[40px]'>{txa('Mağazada da kazandırır')}</Display>
          <div className={cn('grid gap-6', bento.length === 1 ? 'grid-cols-1' : bento.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>{bentoCards}</div>
        </section>
      )}

      {features.length > 0 && (
        <section className='flex flex-col gap-14'>
          <Display className='text-center text-[44px]'>{txa('Premium’un')}<br />{txa('en iyileri')}</Display>
          {features.map((feature, index) => <Feature key={feature.id} id={feature.id} title={feature.title} body={feature.body} visual={feature.visual} flip={index % 2 === 1} />)}
        </section>
      )}

      {on('premium_exclusives') && monthly.length > 0 && (
        <section data-shop-premium-monthly>
          <ShopShelf title={txa('Bu ayın Premium seti')} kicker={txa('Yalnız Premium')} cards={monthly} />
        </section>
      )}

      <section className='grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-10'>
        <div className='flex flex-col gap-4'>
          <Display className='text-[28px]'>{txa('Standart ve Premium')}</Display>
          <div className='overflow-hidden rounded-[22px] border border-border/70 bg-card' data-premium-compare-table>
            <div className='grid grid-cols-[minmax(0,1fr)_120px_150px] border-b border-border/70 px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground'>
              <span>{txa('Özellik')}</span><span className='text-center'>{txa('Standart')}</span><span className='text-center text-foreground'>{txa('Premium')}</span>
            </div>
            {groups.map(({ group, rows }) => (
              <div key={group}>
                <div className='bg-foreground/[0.03] px-5 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>{PREMIUM_PERK_GROUPS[group]}</div>
                {rows.map((perk) => (
                  <div key={perk.key} className='grid grid-cols-[minmax(0,1fr)_120px_150px] items-center border-t border-border/50 px-5 py-3 text-[14px]'>
                    <span>{perk.label}</span>
                    <span className='flex justify-center text-[12.5px] text-muted-foreground'>{perk.key === 'early_access' ? txa('{v1} saat sonra', { v1: hours }) : <Minus size={17} className='text-muted-foreground/50' />}</span>
                    <span className='flex justify-center text-center text-[13px] font-bold'>
                      {perk.key === 'early_access' ? txa('{v1} saat önce', { v1: hours })
                        : perk.key === 'member_pricing' ? txa('%{v1} indirim', { v1: memberPercent ?? 0 })
                          : perk.key === 'coin_bonus' ? `+%${bonusPercent}`
                            : perk.key === 'shop_early_access' ? txa('{v1} saat önce', { v1: shopEarlyHours })
                              : <Check weight='bold' size={17} />}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className='flex flex-col gap-4'>
          <Display className='text-[28px]'>{txa('Sık sorulanlar')}</Display>
          <Accordion type='single' collapsible className='rounded-[22px] border border-border/70 bg-card px-5'>
            {FAQ_BASE.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className='text-[14.5px] font-bold'>{item.q}</AccordionTrigger>
                <AccordionContent className='text-[13.5px] leading-relaxed text-muted-foreground'>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className='flex items-center justify-between gap-8 rounded-[28px] border border-border/70 bg-card px-10 py-9'>
        <div className='flex flex-col gap-2'>
          <Display className='text-[34px]'>{txa('Hazırsan,')}<br />{txa('Premium’lu ol')}</Display>
          <p className='text-[13.5px] text-muted-foreground'>{txa('Süre bitince ayrıcalıklar kapanır; satın aldığın kozmetikler sende kalır.')}</p>
        </div>
        <PriceAndActions card={card} loading={loading} active={active} onBuy={() => open('self')} onGift={() => open('gift')} />
      </section>

      {dialog && card && (
        <ShopPurchaseDialog card={card} open initialMode={dialog} onOpenChange={(next) => { if (!next) setDialog(null) }} onPurchased={() => reload()} />
      )}
    </div>
  )
}
