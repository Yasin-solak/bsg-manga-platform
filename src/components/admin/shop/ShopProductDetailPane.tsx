import type { ReactNode } from 'react'
import { Archive, CircleAlert, ExternalLink, EyeOff, MoreHorizontal, Pencil, RotateCcw, Send, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ShopAdminProduct, ShopStatus } from '@/services/shopAdminService'
import { ShopPreview } from '@/pages/shop/ShopPreview'
import { TYPE_LABEL } from '@/pages/shop/shopFormat'
import { StateChip } from './ShopAdminKit'
import { ADMIN_RARITY, AUDIENCE_LABEL, formatDateTime, formatNumber, ISSUE_LABEL, toPreviewCard } from './shopAdminFormat'
import { txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

function Stat({ label, value, tone, title }: { label: string, value: ReactNode, tone?: 'amber' | 'rose', title?: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd title={title} className={cn('mt-0.5 truncate text-[14px] font-bold tabular-nums', tone === 'amber' && 'text-amber-600 dark:text-amber-300', tone === 'rose' && 'text-rose-600 dark:text-rose-300')}>{value}</dd>
    </div>
  )
}

function windowText(product: ShopAdminProduct) {
  if (!product.availableFrom && !product.availableUntil) return txa('Süresiz')
  if (product.availableFrom && product.availableUntil) return `${formatDateTime(product.availableFrom)} – ${formatDateTime(product.availableUntil)}`
  if (product.availableFrom) return txa('{v1} itibarıyla', { v1: formatDateTime(product.availableFrom) })
  return txa('{v1} tarihine kadar', { v1: formatDateTime(product.availableUntil as string) })
}

/**
 * Selected product (the desk's right panel / drawer on narrow screens): preview, status,
 * problems, sales summary, sales window, season/campaign and bundle contents.
 * Editing is in a detail editor; status changes go through a confirm dialog.
 */
export function ShopProductDetailPane({ product, layout, busy, onEdit, onSetStatus }: {
  product: ShopAdminProduct
  layout: 'desk' | 'sheet'
  busy: boolean
  onEdit: () => void
  onSetStatus: (status: ShopStatus) => void
}) {
  const rarity = ADMIN_RARITY[product.rarity]
  const errors = product.issues.filter((issue) => issue.level === 'error')
  const warnings = product.issues.filter((issue) => issue.level !== 'error')
  const placements = [product.seasonName ? txa('Sezon: {v1}', { v1: product.seasonName }) : null, ...product.campaigns.map((campaign) => `Kampanya: ${campaign.name}`)].filter(Boolean) as string[]

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Ürün ayrıntısı')}
      data-testid="shop-product-detail"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <StateChip state={product.state} />
            {product.kind === 'bundle' ? <span className="rounded-md bg-muted px-1.5 py-px text-[10.5px] font-bold text-muted-foreground">{txa('Paket · {v1} parça', { v1: product.grants.length })}</span> : null}
            {product.kind === 'premium' ? <span className="rounded-md bg-amber-500/12 px-1.5 py-px text-[10.5px] font-bold text-amber-700 dark:text-amber-300">Premium{product.premiumDays ? txa(' · {v1} gün', { v1: product.premiumDays }) : ''}</span> : null}
          </span>
          <h2 className="mt-1 line-clamp-2 break-words text-[17px] font-bold tracking-tight [overflow-wrap:anywhere]">{product.title}</h2>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {TYPE_LABEL[product.type]} · <span className={rarity.ink}>{rarity.label}</span> · /{product.slug}
          </span>
        </span>
        <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
          <Button size={layout === 'desk' ? 'sm' : 'default'} variant="outline" className="gap-1.5" onClick={onEdit} data-testid="shop-product-edit"><Pencil className="size-4" />{txa('Düzenle')}</Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={txa('Diğer işlemler')} data-testid="shop-product-more"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <a href={localizeHref(`/magaza?urun=${encodeURIComponent(product.slug)}`, getActiveLocale())} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Mağazada aç')}</a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {product.status === 'draft' ? <DropdownMenuItem disabled={busy} onSelect={() => onSetStatus('published')} data-testid="shop-product-publish"><Send className="size-4" />{txa('Yayınla…')}</DropdownMenuItem> : null}
              {product.status === 'published' ? <DropdownMenuItem disabled={busy} onSelect={() => onSetStatus('draft')} data-testid="shop-product-unpublish"><EyeOff className="size-4" />{txa('Taslağa al…')}</DropdownMenuItem> : null}
              {product.status === 'archived'
                ? <DropdownMenuItem disabled={busy} onSelect={() => onSetStatus('draft')}><RotateCcw className="size-4" />{txa('Arşivden çıkar (taslak)…')}</DropdownMenuItem>
                : <DropdownMenuItem variant="destructive" disabled={busy} onSelect={() => onSetStatus('archived')} data-testid="shop-product-archive"><Archive className="size-4" />{txa('Arşivle…')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="flex justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30">
          <ShopPreview card={toPreviewCard(product)} variant="card" className="h-40 w-full max-w-[360px]" />
        </div>

        {errors.length || warnings.length ? (
          <section className="space-y-1.5" data-testid="shop-product-issues">
            {errors.map((issue) => (
              <p key={issue.code} className="flex items-center gap-2 rounded-lg bg-rose-500/[0.08] px-3 py-2 text-[12.5px] font-semibold text-rose-700 dark:text-rose-300">
                <CircleAlert className="size-4 shrink-0" />{ISSUE_LABEL[issue.code] ?? issue.code}{issue.lo != null && issue.hi != null ? txa(' (bant {v1}–{v2})', { v1: formatNumber(issue.lo), v2: formatNumber(issue.hi) }) : ''}
              </p>
            ))}
            {warnings.map((issue) => (
              <p key={issue.code} className="flex items-center gap-2 rounded-lg bg-amber-500/[0.08] px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
                <TriangleAlert className="size-4 shrink-0" />{ISSUE_LABEL[issue.code] ?? issue.code}{issue.lo != null && issue.hi != null ? txa(' (bant {v1}–{v2})', { v1: formatNumber(issue.lo), v2: formatNumber(issue.hi) }) : ''}
              </p>
            ))}
          </section>
        ) : null}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/50 sm:grid-cols-3 [&>*]:bg-card" data-testid="shop-product-stats">
          <Stat label={txa('Fiyat')} value={`${formatNumber(product.basePrice)} Coin`} tone="amber" />
          <Stat label={txa('Satış')} value={formatNumber(product.orders)} />
          <Stat label={txa('Gelir')} value={`${formatNumber(product.revenue)} Coin`} />
          <Stat label={txa('Stok')} value={product.stockLimit == null ? txa('Sınırsız') : `${formatNumber(product.soldCount)} / ${formatNumber(product.stockLimit)}`} tone={product.stockLimit != null && product.soldCount >= product.stockLimit ? 'rose' : undefined} />
          <Stat label={txa('Kimler alabilir')} value={AUDIENCE_LABEL[product.audience]} />
          <Stat label={txa('Hediye')} value={product.giftable ? txa('Edilebilir') : txa('Edilemez')} />
        </dl>

        <section>
          <h3 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Satış penceresi')}</h3>
          <p className="text-[13px]">{windowText(product)}{product.hideUntilLaunch ? <span className="text-muted-foreground"> {txa('· başlayana kadar gizli')}</span> : null}</p>
          {placements.length ? <p className="mt-1 text-[12.5px] text-muted-foreground">{placements.join(' · ')}</p> : null}
        </section>

        {product.kind === 'bundle' && product.grants.length ? (
          <section>
            <h3 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Paket içeriği')}</h3>
            <ul className="divide-y divide-border/50 rounded-xl border border-border/60 text-[12.5px]">
              {product.grants.map((grant, index) => (
                <li key={`${grant.type}-${grant.identifier}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate font-semibold">{grant.name || grant.identifier}</span>
                  <span className="shrink-0 text-muted-foreground">{TYPE_LABEL[grant.type as keyof typeof TYPE_LABEL] ?? grant.type}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {product.description?.trim() ? (
          <section>
            <h3 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Açıklama')}</h3>
            <p className="line-clamp-6 whitespace-pre-wrap break-words text-[13px] leading-6 [overflow-wrap:anywhere]">{product.description}</p>
          </section>
        ) : null}

        <p className="text-[11.5px] text-muted-foreground">{txa('Son güncelleme {v1}', { v1: formatDateTime(product.updatedAt) })}</p>
      </div>
    </section>
  )
}
