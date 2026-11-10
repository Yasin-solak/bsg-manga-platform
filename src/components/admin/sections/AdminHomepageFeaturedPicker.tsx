import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ArrowDown, ArrowUp, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import {
  loadHomepageMangaOptionsByIds,
  searchHomepageMangaOptions,
  type HomepageMangaOption,
} from '@/services/homepageConfigService'
import type { SiteSettings } from '@/services/adminService'
import { txa } from '@/i18n/activeLocale'

interface AdminHomepageFeaturedPickerProps {
  settings: SiteSettings
  setSettings: Dispatch<SetStateAction<SiteSettings | null>>
}

const MAX_FEATURED_MANGA_COUNT = 5

export function AdminHomepageFeaturedPicker({ settings, setSettings }: AdminHomepageFeaturedPickerProps) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<HomepageMangaOption[]>([])
  const [selectedOptions, setSelectedOptions] = useState<HomepageMangaOption[]>([])
  const [loading, setLoading] = useState(false)

  const selectedIds = settings.homepageFeaturedMangaIds
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const selected = await loadHomepageMangaOptionsByIds(selectedIds)
      if (!cancelled) setSelectedOptions(selected)
    })()

    return () => {
      cancelled = true
    }
  }, [selectedIds])

  useEffect(() => {
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      void searchHomepageMangaOptions(query, 12)
        .then((result) => {
          if (!cancelled) setOptions(result)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [query])

  function updateSelectedIds(ids: string[]) {
    setSettings((prev) => (prev ? { ...prev, homepageFeaturedMangaIds: ids.slice(0, MAX_FEATURED_MANGA_COUNT) } : prev))
  }

  function addManga(id: string) {
    if (selectedIdSet.has(id) || selectedIds.length >= MAX_FEATURED_MANGA_COUNT) return
    updateSelectedIds([...selectedIds, id])
  }

  function removeManga(id: string) {
    updateSelectedIds(selectedIds.filter((item) => item !== id))
  }

  function moveManga(id: string, direction: -1 | 1) {
    const currentIndex = selectedIds.indexOf(id)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= selectedIds.length) return

    const next = [...selectedIds]
    const [item] = next.splice(currentIndex, 1)
    next.splice(targetIndex, 0, item)
    updateSelectedIds(next)
  }

  return (
    <Card className="gap-4 rounded-[20px] border-border/70 bg-card/60 p-5 shadow-none">
      <CardHeader className="px-0 pb-0">
        <CardTitle className="text-base">{txa('Ana sayfa öne çıkan seri')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {txa('Hero alanında görünecek en fazla 5 seriyi ve sıralamasını yönet.')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        <div className="space-y-2">
          <Label htmlFor="homepage-featured-search">{txa('Seri ara')}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="homepage-featured-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder={txa('Manga başlığı veya slug')}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {txa('Seçilenler {v1}/{v2}', { v1: selectedIds.length, v2: MAX_FEATURED_MANGA_COUNT })}
            </div>
            {selectedOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                {txa('Henüz seri seçilmedi.')}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedOptions.map((item, index) => (
                  <SelectedMangaRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={selectedOptions.length}
                    onMove={moveManga}
                    onRemove={removeManga}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {txa('Sonuçlar')}
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground">{txa('Yükleniyor...')}</div>
              ) : options.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">{txa('Sonuç yok.')}</div>
              ) : (
                options.map((item) => (
                  <MangaOptionRow
                    key={item.id}
                    item={item}
                    disabled={selectedIdSet.has(item.id) || selectedIds.length >= MAX_FEATURED_MANGA_COUNT}
                    selected={selectedIdSet.has(item.id)}
                    onAdd={addManga}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SelectedMangaRow({
  item,
  index,
  total,
  onMove,
  onRemove,
}: {
  item: HomepageMangaOption
  index: number
  total: number
  onMove: (id: string, direction: -1 | 1) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-2">
      <MangaThumb item={item} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold">{index + 1}. {item.title}</p>
        <p className="text-[11px] text-muted-foreground">{item.slug || item.id}</p>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label={txa('Yukarı taşı')} disabled={index === 0} onClick={() => onMove(item.id, -1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label={txa('Aşağı taşı')} disabled={index === total - 1} onClick={() => onMove(item.id, 1)}>
          <ArrowDown className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label={txa('Kaldır')} onClick={() => onRemove(item.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}

function MangaOptionRow({
  item,
  disabled,
  selected,
  onAdd,
}: {
  item: HomepageMangaOption
  disabled: boolean
  selected: boolean
  onAdd: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
      <MangaThumb item={item} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold">{item.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {typeof item.rating === 'number' ? `${item.rating.toFixed(1)} puan` : txa('Puan yok')}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={selected ? 'secondary' : 'outline'}
        disabled={disabled}
        onClick={() => onAdd(item.id)}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {selected ? txa('Seçili') : txa('Ekle')}
      </Button>
    </div>
  )
}

function MangaThumb({ item }: { item: HomepageMangaOption }) {
  const src = item.coverImageUrl || buildCoverPlaceholder(item.title)

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-14 w-10 shrink-0 rounded-md object-cover"
      onError={(event) => {
        event.currentTarget.src = buildCoverPlaceholder(item.title)
      }}
    />
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}
