import { BellPlus, BookPlus, ChevronDown, FilePlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FansubStudioNavItem } from './fansubStudioNavigation'
import { txa } from '@/i18n/activeLocale'

interface FansubYonetHeaderProps {
  /** The active tab's navigation record: title, description and icon come from here. */
  item: FansubStudioNavItem | undefined
  /** Genel bakista baslik yerine selamlama gosterilir. */
  greetingName?: string | null
  canCreateContent: boolean
  canWriteNotice: boolean
  /** Studio ici manga ekleme modalini acar. */
  onCreateManga: () => void
  /** Opens the in-studio chapter add modal. */
  onCreateChapter: () => void
  onWriteNotice: () => void
}

/**
 * FansubYonetHeader v2: page header.
 *
 * Identity (name, role, boost, vault) stays in the sidebar; this row only answers
 * "where am I, what is done here" and gathers production actions under one
 * "New" entry.
 */
export default function FansubYonetHeader({
  item,
  greetingName,
  canCreateContent,
  canWriteNotice,
  onCreateManga,
  onCreateChapter,
  onWriteNotice,
}: FansubYonetHeaderProps) {
  const Icon = item?.icon
  const isHome = item?.id === 'genel'
  const title = isHome && greetingName ? txa('Hoş geldin, {v1}', { v1: greetingName }) : item?.label || txa('Stüdyo')
  const hasCreate = canCreateContent || canWriteNotice

  return (
    <header className="flex flex-wrap items-end justify-between gap-4" data-testid="fansub-studio-header">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <span className="hidden size-11 flex-none items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary sm:flex">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-black tracking-tight text-foreground sm:text-[26px]">{title}</h1>
          {item?.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{item.description}</p>}
        </div>
      </div>

      {hasCreate && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" className="gap-1.5 rounded-full px-4" data-testid="fansub-studio-create">
              <Plus className="h-4 w-4" />
              {txa('Yeni')}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canCreateContent && (
              <>
                <DropdownMenuItem onSelect={onCreateManga} className="gap-2.5 py-2">
                  <BookPlus className="h-4 w-4 text-primary" />
                  <span className="flex flex-col">
                    <span className="font-semibold">{txa('Seri ekle')}</span>
                    <span className="text-[11px] text-muted-foreground">{txa('Yeni manga ya da webtoon')}</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onCreateChapter} className="gap-2.5 py-2">
                  <FilePlus className="h-4 w-4 text-primary" />
                  <span className="flex flex-col">
                    <span className="font-semibold">{txa('Bölüm ekle')}</span>
                    <span className="text-[11px] text-muted-foreground">{txa('Sayfaları yükle, yayına gönder')}</span>
                  </span>
                </DropdownMenuItem>
              </>
            )}
            {canWriteNotice && (
              <DropdownMenuItem onSelect={onWriteNotice} className="gap-2.5 py-2">
                <BellPlus className="h-4 w-4 text-primary" />
                <span className="flex flex-col">
                  <span className="font-semibold">{txa('Duyuru yaz')}</span>
                  <span className="text-[11px] text-muted-foreground">{txa('Takipçilerine haber ver')}</span>
                </span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  )
}
