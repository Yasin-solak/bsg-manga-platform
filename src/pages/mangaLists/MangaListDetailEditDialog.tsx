import { useMemo } from 'react'
import type { Manga } from '@/types'
import { ArrowDown, ArrowUp, Lock, Save, Search, Trash2, Unlock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_TITLE_MAX_LENGTH,
  LIST_TITLE_MIN_LENGTH,
  MANGA_LIST_HERO_COVER_COUNT,
  MANGA_LIST_ITEM_NOTE_MAX_LENGTH,
  MANGA_LIST_MIN_ITEM_COUNT,
} from './mangaListsPage.shared'
import { txa } from '@/i18n/activeLocale'

interface MangaListDetailEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  saving: boolean
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  isPublic: boolean
  setIsPublic: (v: boolean) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  searchLoading: boolean
  searchResults: Manga[]
  selectedMangas: Manga[]
  notes: Record<string, string>
  onAddManga: (manga: Manga) => void
  onRemoveManga: (mangaId: string) => void
  onMoveItem: (index: number, direction: 'up' | 'down') => void
  onNoteChange: (mangaId: string, note: string) => void
  onSave: () => void
}

export function MangaListDetailEditDialog({
  open,
  onOpenChange,
  saving,
  title,
  setTitle,
  description,
  setDescription,
  isPublic,
  setIsPublic,
  searchQuery,
  setSearchQuery,
  searchLoading,
  searchResults,
  selectedMangas,
  notes,
  onAddManga,
  onRemoveManga,
  onMoveItem,
  onNoteChange,
  onSave,
}: MangaListDetailEditDialogProps) {
  const selectedIds = useMemo(() => new Set(selectedMangas.map((m) => m.id)), [selectedMangas])
  const normalizedTitleLength = title.trim().length
  const isTitleInvalid = normalizedTitleLength > 0 && normalizedTitleLength < LIST_TITLE_MIN_LENGTH
  const canSave = !saving
    && normalizedTitleLength >= LIST_TITLE_MIN_LENGTH
    && selectedMangas.length >= MANGA_LIST_MIN_ITEM_COUNT
  const coverSlots = Array.from({ length: MANGA_LIST_HERO_COVER_COUNT }, (_, index) => selectedMangas[index] || null)
  const missingMangaCount = Math.max(0, MANGA_LIST_MIN_ITEM_COUNT - selectedMangas.length)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden border-border/70 bg-card p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Save className="h-5 w-5 text-primary" />
            {txa('Listeyi Düzenle')}
          </DialogTitle>
          <DialogDescription>
            {txa('Başlık, açıklama, görünürlük, manga sırası ve neden listede notlarını güncelleyin.')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-140px)] gap-0 overflow-y-auto lg:grid-cols-[minmax(0,.88fr)_minmax(0,1.12fr)]">
          <div className="space-y-4 border-b border-border/60 p-5 lg:border-b-0 lg:border-r">
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{txa('Hero kapak seti')}</p>
                  <p className="mt-1 text-sm text-foreground">
                    {selectedMangas.length >= MANGA_LIST_MIN_ITEM_COUNT
                      ? txa('İlk 5 seri kapağı hero kolajında kullanılır.')
                      : txa('{count} manga daha gerekli.', { count: missingMangaCount })}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'border-border/70 px-3 py-1.5',
                    selectedMangas.length >= MANGA_LIST_MIN_ITEM_COUNT && 'border-emerald-500/40 text-emerald-400',
                  )}
                >
                  {selectedMangas.length}/{MANGA_LIST_MIN_ITEM_COUNT}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-1.5">
                {coverSlots.map((manga, index) => (
                  manga ? (
                    <img
                      key={manga.id}
                      src={manga.coverImage}
                      alt={manga.title}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[3/4] w-full rounded-lg border border-white/10 object-cover"
                    />
                  ) : (
                    <div
                      key={`edit-cover-placeholder-${index}`}
                      className="aspect-[3/4] rounded-lg border border-dashed border-border/70 bg-muted/20"
                      aria-hidden="true"
                    />
                  )
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{txa('Liste Başlığı')}</p>
                <span
                  className={cn(
                    'text-[11px] text-muted-foreground',
                    title.length >= LIST_TITLE_MAX_LENGTH && 'text-primary',
                  )}
                >
                  {title.length}/{LIST_TITLE_MAX_LENGTH}
                </span>
              </div>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={LIST_TITLE_MAX_LENGTH}
                aria-invalid={isTitleInvalid}
                className="h-11"
              />
              {isTitleInvalid && (
                <p className="text-[11px] text-destructive">
                  {txa('Başlık en az {v1} karakter olmalı.', { v1: LIST_TITLE_MIN_LENGTH })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{txa('Açıklama')}</p>
                <span
                  className={cn(
                    'text-[11px] text-muted-foreground',
                    description.length >= LIST_DESCRIPTION_MAX_LENGTH && 'text-primary',
                  )}
                >
                  {description.length}/{LIST_DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                maxLength={LIST_DESCRIPTION_MAX_LENGTH}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{txa('Görünürlük')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isPublic ? 'default' : 'outline'}
                  className="gap-1.5"
                  onClick={() => setIsPublic(true)}
                >
                  <Unlock className="h-3.5 w-3.5" />
                  {txa('Herkese Açık')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!isPublic ? 'default' : 'outline'}
                  className="gap-1.5"
                  onClick={() => setIsPublic(false)}
                >
                  <Lock className="h-3.5 w-3.5" />
                  {txa('Özel')}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{txa('Manga Ekle')}</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-11 pl-9"
                  placeholder={txa('Manga ara...')}
                />
              </div>
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-border/70 bg-background/35 p-2">
                {searchLoading ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">{txa('Aranıyor...')}</p>
                ) : searchResults.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {txa('En az 2 karakter ile manga arayın.')}
                  </p>
                ) : (
                  searchResults.map((manga) => (
                    <button
                      key={manga.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors',
                        selectedIds.has(manga.id)
                          ? 'border-primary/30 bg-primary/10'
                          : 'border-border/70 bg-card/45 hover:bg-accent/40',
                      )}
                      onClick={() => onAddManga(manga)}
                      disabled={selectedIds.has(manga.id)}
                    >
                      <img
                        loading="lazy"
                        decoding="async"
                        src={manga.coverImage}
                        alt={manga.title}
                        className="h-12 w-9 shrink-0 rounded-md object-cover"
                      />
                      <p className="line-clamp-1 flex-1 text-sm font-medium">{manga.title}</p>
                      <span className="text-[11px] font-medium text-primary">
                        {selectedIds.has(manga.id) ? txa('Eklendi') : txa('Ekle')}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{txa('Seçili Mangalar')}</p>
                <Badge variant="outline">{txa('{v1} adet', { v1: selectedMangas.length })}</Badge>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border/70 bg-background/35 p-2">
                {selectedMangas.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {txa('Listeye en az {v1} manga eklemelisiniz.', { v1: MANGA_LIST_MIN_ITEM_COUNT })}
                  </p>
                ) : (
                  selectedMangas.map((manga, index) => {
                    const note = notes[manga.id] || ''
                    return (
                      <div key={manga.id} className="rounded-lg border border-border/70 bg-card/45 p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 text-center text-xs font-semibold text-muted-foreground">{index + 1}</span>
                          <img
                            loading="lazy"
                            decoding="async"
                            src={manga.coverImage}
                            alt={manga.title}
                            className="h-12 w-9 shrink-0 rounded-md object-cover"
                          />
                          <p className="line-clamp-1 min-w-0 flex-1 text-sm font-medium">{manga.title}</p>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={txa('{title} yukarı taşı', { title: manga.title })}
                              onClick={() => onMoveItem(index, 'up')}
                              disabled={index === 0}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={txa('{title} aşağı taşı', { title: manga.title })}
                              onClick={() => onMoveItem(index, 'down')}
                              disabled={index === selectedMangas.length - 1}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={txa('{title} kaldır', { title: manga.title })}
                              className="text-destructive"
                              onClick={() => onRemoveManga(manga.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {txa('Neden listede?')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {note.length}/{MANGA_LIST_ITEM_NOTE_MAX_LENGTH}
                            </span>
                          </div>
                          <Input
                            value={note}
                            onChange={(event) => onNoteChange(manga.id, event.target.value)}
                            placeholder={txa('Bu mangayı neden seçtiğini yaz')}
                            maxLength={MANGA_LIST_ITEM_NOTE_MAX_LENGTH}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {txa('İptal')}
          </Button>
          <Button type="button" disabled={!canSave} onClick={onSave}>
            {saving ? txa('Kaydediliyor...') : txa('Değişiklikleri Kaydet')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
