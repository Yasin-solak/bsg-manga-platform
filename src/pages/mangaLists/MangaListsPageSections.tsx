import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ListPlus, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

export function CreateHero({
  stats,
  createDialog,
  coverImages,
}: {
  stats: Array<{
    id: string
    label: string
    value: number
    icon: LucideIcon
  }>
  createDialog: ReactNode
  coverImages: string[]
}) {
  const imageSlots = coverImages.slice(0, 5)

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(360px,.85fr)_minmax(520px,1fr)]">
      <Card className="gap-0 overflow-hidden border-border/70 bg-card/85 py-0">
        <CardContent className="grid min-h-[172px] gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_210px]">
          <div className="space-y-2">
            <h2 className="text-lg font-black tracking-tight text-foreground">{txa('Yeni Liste Oluştur')}</h2>
            <p className="max-w-md text-xs leading-5 text-muted-foreground">
              {txa('Kendi temalı listeni oluştur, serileri ekle ve topluluğa ilham ver.')}
            </p>
            <div className="pt-4">{createDialog}</div>
          </div>

          <div className="relative hidden min-h-[140px] items-center justify-center sm:flex">
            {imageSlots.map((image, index) => {
              const placements = [
                'right-[9.5rem] top-9 z-10 rotate-[-14deg]',
                'right-[7.2rem] top-4 z-20 rotate-[-7deg]',
                'right-[4.8rem] top-1 z-30 rotate-[1deg]',
                'right-[2.4rem] top-5 z-20 rotate-[8deg]',
                'right-0 top-10 z-10 rotate-[14deg]',
              ]
              return (
                <img
                  key={`${image}-${index}`}
                  src={image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={cn(
                    'absolute h-28 w-20 rounded-xl border border-white/12 object-cover shadow-2xl',
                    placements[index],
                  )}
                />
              )
            })}
            <div className="absolute bottom-1 left-2 flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-background/90 text-primary shadow-xl">
              <ListPlus className="h-5 w-5" />
            </div>
            <div className="absolute bottom-6 right-10 rounded-2xl border border-primary/20 bg-background/80 px-3 py-2 shadow-xl">
              <p className="text-xs font-black text-foreground">{txa('Kapak seti')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.id} className="gap-0 border-border/70 bg-card/85 py-0">
              <CardContent className="flex min-h-[80px] items-center gap-3 p-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground">{txa(stat.label)}</p>
                  <p className="mt-1 text-2xl font-black leading-none text-foreground">{stat.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{txa('Güncel veri')}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export function CreateListTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[292px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/55 p-4 text-center transition-colors hover:border-primary/45 hover:bg-primary/10"
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
        <ListPlus className="h-5 w-5" />
      </span>
      <p className="text-sm font-black text-foreground group-hover:text-primary">{txa('Yeni Liste')}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{txa('Yeni Liste Oluştur')}</p>
    </button>
  )
}

export function SignedOutListNotice() {
  return (
    <Card className="gap-0 border-border/70 bg-card/70 py-0 md:col-span-1 2xl:col-span-3">
      <CardContent className="flex h-full min-h-[132px] items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-black text-foreground">{txa('Listelerini görmek için giriş yap')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{txa('Özel listeler, takip ettiklerin ve planladıkların hesabınla eşleşir.')}</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/giris">{txa('Giriş Yap')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function CategoryChip({
  active,
  label,
  icon,
  count,
  onClick,
}: {
  active: boolean
  label: string
  icon?: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[62px] min-w-[142px] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border/70 bg-background/55 text-muted-foreground hover:border-primary/35 hover:text-foreground',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-black', active ? 'bg-white/18' : 'bg-primary/10 text-primary')}>
          {icon || label.slice(0, 1)}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/18' : 'bg-primary/10 text-primary')}>{count}</span>
    </button>
  )
}

export function CardSkeletonGrid({ count }: { count: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="h-[316px] animate-pulse gap-0 border-border/70 bg-muted/20 py-0" />
      ))}
    </div>
  )
}
