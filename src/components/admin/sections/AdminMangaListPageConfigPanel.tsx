import type { Dispatch, SetStateAction } from 'react'
import { ImagePlus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SiteSettings } from '@/services/adminService'
import { DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES, sanitizeMangaListCreateCoverImages } from '@/services/mangaListPageConfigService'
import { txa } from '@/i18n/activeLocale'

interface AdminMangaListPageConfigPanelProps {
  settings: SiteSettings
  setSettings: Dispatch<SetStateAction<SiteSettings | null>>
}

export function AdminMangaListPageConfigPanel({
  settings,
  setSettings,
}: AdminMangaListPageConfigPanelProps) {
  const images = sanitizeMangaListCreateCoverImages(settings.mangaListCreateCoverImages)

  function updateImage(index: number, value: string) {
    const next = [...images]
    next[index] = value
    setSettings((prev) => (prev ? { ...prev, mangaListCreateCoverImages: sanitizeMangaListCreateCoverImages(next) } : prev))
  }

  function resetImages() {
    setSettings((prev) => (prev ? { ...prev, mangaListCreateCoverImages: DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES } : prev))
  }

  return (
    <Card className="gap-4 rounded-[20px] border-border/70 bg-card/60 p-5 shadow-none">
      <CardHeader className="px-0 pb-0">
        <CardTitle className="text-base">{txa('Listeler sayfası vitrin görselleri')}</CardTitle>
        <CardDescription>
          {txa('“Yeni Liste Oluştur” kartında görünen üç kapak görselini yönet.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 px-0 lg:grid-cols-3">
        {images.map((image, index) => (
          <div key={`${image}-${index}`} className="space-y-2">
            <Label htmlFor={`manga-list-cover-${index}`}>{txa('Kapak {v1}', { v1: index + 1 })}</Label>
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              {image ? (
                <img src={image} alt="" className="h-28 w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="flex h-28 items-center justify-center text-muted-foreground">
                  <ImagePlus className="size-5" />
                </div>
              )}
            </div>
            <Input
              id={`manga-list-cover-${index}`}
              value={image}
              onChange={(event) => updateImage(index, event.target.value)}
              placeholder="/assets/explore/collections/dram.webp"
            />
          </div>
        ))}

        <div className="flex items-end lg:col-span-3">
          <Button type="button" variant="outline" onClick={resetImages}>
            <RotateCcw className="mr-2 size-4" />
            {txa('Varsayılana dön')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
