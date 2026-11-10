import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Search, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { cn } from '@/lib/utils'
import { GENRE_PRESETS, prettifyGenreName } from '@/pages/explore/explorePageShared'
import {
  loadHomepageMangaOptionsByIds,
  searchHomepageMangaOptions,
  type HomepageMangaOption,
} from '@/services/homepageConfigService'
import { uploadStorefrontVisual } from '@/services/storageService'
import { toast } from '@/services/toastService'
import type { ExploreCollectionConfig } from '@/services/exploreConfigService'
import type { SiteSettings } from '@/services/adminService'
import { txa } from '@/i18n/activeLocale'

interface AdminExploreCurationPanelProps {
  settings: SiteSettings
  setSettings: Dispatch<SetStateAction<SiteSettings | null>>
}

const MAX_EDITOR_MANGA_COUNT = 12
const COLLECTION_PRESET_IMAGES = [
  '/assets/explore/collections/guc-fantezi.webp',
  '/assets/explore/collections/aksiyon.webp',
  '/assets/explore/collections/romantik.webp',
  '/assets/explore/collections/dram.webp',
]

export function AdminExploreCurationPanel({ settings, setSettings }: AdminExploreCurationPanelProps) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<HomepageMangaOption[]>([])
  const [selectedOptions, setSelectedOptions] = useState<HomepageMangaOption[]>([])
  const [loading, setLoading] = useState(false)
  const selectedIds = settings.exploreEditorMangaIds
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
      void searchHomepageMangaOptions(query, 16)
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
    setSettings((prev) => (prev ? { ...prev, exploreEditorMangaIds: ids.slice(0, MAX_EDITOR_MANGA_COUNT) } : prev))
  }

  function addManga(id: string) {
    if (selectedIdSet.has(id) || selectedIds.length >= MAX_EDITOR_MANGA_COUNT) return
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

  function updateCollections(collections: ExploreCollectionConfig[]) {
    const normalized = collections
      .map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }))
      .slice(0, 12)
    setSettings((prev) => (prev ? { ...prev, exploreCollections: normalized } : prev))
  }

  function patchCollection(id: string, patch: Partial<ExploreCollectionConfig>) {
    updateCollections(settings.exploreCollections.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function addCollection() {
    const nextIndex = settings.exploreCollections.length
    updateCollections([
      ...settings.exploreCollections,
      {
        id: `koleksiyon-${Date.now()}`,
        title: txa('Yeni Koleksiyon'),
        targetGenreId: GENRE_PRESETS[0]?.id || 'action',
        imageUrl: COLLECTION_PRESET_IMAGES[nextIndex % COLLECTION_PRESET_IMAGES.length],
        isActive: true,
        sortOrder: (nextIndex + 1) * 10,
      },
    ])
  }

  function removeCollection(id: string) {
    updateCollections(settings.exploreCollections.filter((item) => item.id !== id))
  }

  function moveCollection(id: string, direction: -1 | 1) {
    const currentIndex = settings.exploreCollections.findIndex((item) => item.id === id)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= settings.exploreCollections.length) return

    const next = [...settings.exploreCollections]
    const [item] = next.splice(currentIndex, 1)
    next.splice(targetIndex, 0, item)
    updateCollections(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-4 rounded-[20px] border-border/70 bg-card/60 p-5 shadow-none">
        <CardHeader className="px-0 pb-0">
          <CardTitle className="text-base">{txa('Keşfet editör seçimleri')}</CardTitle>
          <CardDescription>
            {txa('Keşfet sayfasındaki yatay kayan editör kartlarını ve sıralamasını yönet.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-0">
          <div className="flex flex-col gap-2">
            <Label htmlFor="explore-editor-search">{txa('Seri ara')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="explore-editor-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder={txa('Manga başlığı veya slug')}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {txa('Seçilenler {v1}/{v2}', { v1: selectedIds.length, v2: MAX_EDITOR_MANGA_COUNT })}
              </div>
              {selectedOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                  {txa('Henüz seri seçilmedi. Boş kalırsa keşfet sayfası popüler serilerle dolar.')}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
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

            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{txa('Sonuçlar')}</div>
              <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                {loading ? (
                  <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground">{txa('Yükleniyor...')}</div>
                ) : options.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">{txa('Sonuç yok.')}</div>
                ) : (
                  options.map((item) => (
                    <MangaOptionRow
                      key={item.id}
                      item={item}
                      disabled={selectedIdSet.has(item.id) || selectedIds.length >= MAX_EDITOR_MANGA_COUNT}
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

      <Card className="gap-4 rounded-[20px] border-border/70 bg-card/60 p-5 shadow-none">
        <CardHeader className="px-0 pb-0">
          <CardTitle className="text-base">{txa('Keşfet tematik koleksiyonları')}</CardTitle>
          <CardDescription>
            {txa('Koleksiyon kartı görselini yükle, hedef türü seç ve keşfet sayfasındaki sırasını belirle.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0">
          {settings.exploreCollections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              {txa('Henüz koleksiyon yok.')}
            </div>
          ) : (
            settings.exploreCollections.map((collection, index) => (
              <ExploreCollectionEditorRow
                key={collection.id}
                collection={collection}
                index={index}
                total={settings.exploreCollections.length}
                onPatch={patchCollection}
                onMove={moveCollection}
                onRemove={removeCollection}
              />
            ))
          )}

          <div>
            <Button type="button" variant="outline" onClick={addCollection}>
              <Plus className="mr-2 size-4" />
              {txa('Koleksiyon ekle')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
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
          <ArrowUp className="size-3.5" />
        </IconButton>
        <IconButton label={txa('Aşağı taşı')} disabled={index === total - 1} onClick={() => onMove(item.id, 1)}>
          <ArrowDown className="size-3.5" />
        </IconButton>
        <IconButton label={txa('Kaldır')} onClick={() => onRemove(item.id)}>
          <Trash2 className="size-3.5" />
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
        <Plus className="mr-1 size-3.5" />
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

function ExploreCollectionEditorRow({
  collection,
  index,
  total,
  onPatch,
  onMove,
  onRemove,
}: {
  collection: ExploreCollectionConfig
  index: number
  total: number
  onPatch: (id: string, patch: Partial<ExploreCollectionConfig>) => void
  onMove: (id: string, direction: -1 | 1) => void
  onRemove: (id: string) => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const uploadedUrl = await uploadStorefrontVisual(file, `explore/collections/${collection.id}`)
      onPatch(collection.id, { imageUrl: uploadedUrl })
      toast.success(txa('Koleksiyon görseli yüklendi.'))
    } catch (error) {
      const message = error instanceof Error ? txa(error.message) : txa('Koleksiyon görseli yüklenemedi.')
      toast.error(message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    await handleUpload(file)
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-muted/15 p-3 lg:grid-cols-[112px_minmax(0,1fr)_auto]">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {collection.imageUrl ? (
          <img src={collection.imageUrl} alt="" className="h-28 w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="flex h-28 items-center justify-center text-muted-foreground">
            <ImagePlus className="size-5" />
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`explore-collection-title-${collection.id}`}>{txa('Başlık')}</Label>
          <Input
            id={`explore-collection-title-${collection.id}`}
            value={collection.title}
            onChange={(event) => onPatch(collection.id, { title: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{txa('Hedef tür')}</Label>
          <Select
            value={collection.targetGenreId}
            onValueChange={(value) => onPatch(collection.id, { targetGenreId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder={txa('Tür seç')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {GENRE_PRESETS.map((genre) => (
                  <SelectItem key={genre.id} value={genre.id}>
                    {genre.name || prettifyGenreName(genre.id)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor={`explore-collection-image-${collection.id}`}>{txa('Görsel URL')}</Label>
          <div className="flex gap-2">
            <Input
              id={`explore-collection-image-${collection.id}`}
              value={collection.imageUrl}
              onChange={(event) => onPatch(collection.id, { imageUrl: event.target.value })}
              placeholder="/assets/explore/collections/aksiyon.webp"
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="mr-2 size-4" />
              {uploading ? txa('Yükleniyor') : txa('Yükle')}
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id={`explore-collection-active-${collection.id}`}
            checked={collection.isActive}
            onCheckedChange={(checked) => onPatch(collection.id, { isActive: checked })}
          />
          <Label htmlFor={`explore-collection-active-${collection.id}`}>{txa('Aktif')}</Label>
        </div>
      </div>

      <div className="flex items-center gap-1 lg:flex-col">
        <IconButton label={txa('Yukarı taşı')} disabled={index === 0} onClick={() => onMove(collection.id, -1)}>
          <ArrowUp className="size-3.5" />
        </IconButton>
        <IconButton label={txa('Aşağı taşı')} disabled={index === total - 1} onClick={() => onMove(collection.id, 1)}>
          <ArrowDown className="size-3.5" />
        </IconButton>
        <IconButton label={txa('Sil')} onClick={() => onRemove(collection.id)}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </div>
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
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        'disabled:pointer-events-none disabled:opacity-35',
      )}
    >
      {children}
    </button>
  )
}
