import type { Manga } from '@/types'
import { Lock, ListChecks, ListPlus, Search, Unlock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  LIST_CATEGORY_PRESETS,
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_TITLE_MAX_LENGTH,
  LIST_TITLE_MIN_LENGTH,
  MANGA_LIST_HERO_COVER_COUNT,
  MANGA_LIST_ITEM_NOTE_MAX_LENGTH,
  MANGA_LIST_MIN_ITEM_COUNT,
  type MangaListCategoryId,
} from './mangaListsPage.shared'
import { txa } from '@/i18n/activeLocale'

type MangaListsCreateDialogProps = {
  createOpen: boolean
  onOpenChange: (open: boolean) => void
  creating: boolean
  newTitle: string
  onNewTitleChange: (value: string) => void
  newDescription: string
  onNewDescriptionChange: (value: string) => void
  isPublic: boolean
  onVisibilityChange: (nextValue: boolean) => void
  categoryId: MangaListCategoryId
  onCategoryChange: (nextValue: MangaListCategoryId) => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  searchLoading: boolean
  searchResults: Manga[]
  selectedIds: Set<string>
  onAddManga: (manga: Manga) => void
  selectedMangas: Manga[]
  selectedNotes: Record<string, string>
  onChangeMangaNote: (mangaId: string, value: string) => void
  onRemoveManga: (mangaId: string) => void
  onCreate: () => void
}

export function MangaListsCreateDialog({
  createOpen,
  onOpenChange,
  creating,
  newTitle,
  onNewTitleChange,
  newDescription,
  onNewDescriptionChange,
  isPublic,
  onVisibilityChange,
  categoryId,
  onCategoryChange,
  searchQuery,
  onSearchQueryChange,
  searchLoading,
  searchResults,
  selectedIds,
  onAddManga,
  selectedMangas,
  selectedNotes,
  onChangeMangaNote,
  onRemoveManga,
  onCreate,
}: MangaListsCreateDialogProps) {
  const normalizedTitleLength = newTitle.trim().length
  const canCreate = !creating
    && normalizedTitleLength >= LIST_TITLE_MIN_LENGTH
    && selectedMangas.length >= MANGA_LIST_MIN_ITEM_COUNT
  const selectedCoverSlots = Array.from({ length: MANGA_LIST_HERO_COVER_COUNT }, (_, index) => selectedMangas[index] || null)
  const missingMangaCount = Math.max(0, MANGA_LIST_MIN_ITEM_COUNT - selectedMangas.length)

  return (
    <Dialog open={createOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <ListPlus className="h-4 w-4" />
          {txa('Liste Oluştur')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-hidden border-border/70 bg-card p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <ListChecks className="h-5 w-5 text-primary" />
            {txa('Yeni Manga Listesi')}
          </DialogTitle>
          <DialogDescription>
            {txa('En az')}{' '}{MANGA_LIST_MIN_ITEM_COUNT}{' '}{txa('manga secin; hero kapagi secilen ilk')}{' '}{MANGA_LIST_HERO_COVER_COUNT}{' '}{txa('kapaktan olusur.')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-140px)] gap-0 overflow-y-auto lg:grid-cols-[minmax(0,.88fr)_minmax(0,1.12fr)]">
          <div className="space-y-4 border-b border-border/60 p-5 lg:border-b-0 lg:border-r">
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{txa('Liste kurulumu')}</p>
                  <p className="mt-1 text-sm text-foreground">
                    {selectedMangas.length >= MANGA_LIST_MIN_ITEM_COUNT
                      ? txa('Kapak seti ve seri sayısı hazır.')
                      : txa('{count} manga daha seçmelisiniz.', { count: missingMangaCount })}
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
                {selectedCoverSlots.map((manga, index) => (
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
                      key={`cover-placeholder-${index}`}
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
                    newTitle.length >= LIST_TITLE_MAX_LENGTH && 'text-primary',
                  )}
                >
                  {newTitle.length}/{LIST_TITLE_MAX_LENGTH}
                </span>
              </div>
              <Input
                value={newTitle}
                onChange={(event) => onNewTitleChange(event.target.value)}
                placeholder={txa('Örnek: Karanlık fantazi seçmeleri')}
                maxLength={LIST_TITLE_MAX_LENGTH}
                aria-invalid={normalizedTitleLength > 0 && normalizedTitleLength < LIST_TITLE_MIN_LENGTH}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{txa('Açıklama')}</p>
                <span
                  className={cn(
                    'text-[11px] text-muted-foreground',
                    newDescription.length >= LIST_DESCRIPTION_MAX_LENGTH && 'text-primary',
                  )}
                >
                  {newDescription.length}/{LIST_DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                value={newDescription}
                onChange={(event) => onNewDescriptionChange(event.target.value)}
                placeholder={txa('Bu listenin temasını genel bakışta anlat.')}
                rows={5}
                maxLength={LIST_DESCRIPTION_MAX_LENGTH}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{txa('Görünürlük')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={isPublic ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onVisibilityChange(true)}
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    {txa('Açık')}
                  </Button>
                  <Button
                    type="button"
                    variant={!isPublic ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onVisibilityChange(false)}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {txa('Özel')}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{txa('Liste Türü')}</p>
                <div className="grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-border/60 bg-background/35 p-1">
                  {LIST_CATEGORY_PRESETS.map((category) => {
                    const active = categoryId === category.id
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => onCategoryChange(category.id)}
                        className={cn(
                          'min-h-9 rounded-lg border px-2 text-left text-[11px] font-bold transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border/70 bg-background/55 text-muted-foreground hover:border-primary/35 hover:text-foreground',
                        )}
                      >
                        <span className="mr-1">{category.icon}</span>
                        {category.label}
                      </button>
                    )
                  })}
                </div>
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
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  placeholder={txa('Manga ara...')}
                  className="h-11 pl-9"
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
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">{manga.title}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {manga.lastChapter || txa('Yeni seri')}
                        </p>
                      </div>
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
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border/70 bg-background/35 p-2">
                {selectedMangas.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {txa('Hero kapağı ve listeyi oluşturmak için en az {v1} manga seçin.', { v1: MANGA_LIST_MIN_ITEM_COUNT })}
                  </p>
                ) : (
                  selectedMangas.map((manga, index) => {
                    const note = selectedNotes[manga.id] || ''
                    return (
                      <div
                        key={manga.id}
                        className="rounded-lg border border-border/70 bg-card/45 px-2.5 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-center text-xs font-semibold text-muted-foreground">{index + 1}</span>
                          <img
                            loading="lazy"
                            decoding="async"
                            src={manga.coverImage}
                            alt={manga.title}
                            className="h-12 w-9 shrink-0 rounded-md object-cover"
                          />
                          <p className="line-clamp-1 flex-1 text-sm font-medium">{manga.title}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                            onClick={() => onRemoveManga(manga.id)}
                          >
                            {txa('Kaldır')}
                          </Button>
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
                            onChange={(event) => onChangeMangaNote(manga.id, event.target.value)}
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
          <Button type="button" onClick={onCreate} disabled={!canCreate}>
            {creating ? txa('Oluşturuluyor...') : txa('Listeyi Oluştur')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
