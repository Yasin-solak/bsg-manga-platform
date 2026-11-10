/**
 * FansubMangaRevisionDialog: a fix request for a published series.
 *
 * A fansub cannot change a live series directly; only changed fields + a reason
 * note go to site admin approval (submit_fansub_manga_revision). Until
 * approved, readers see the old info.
 */
import { useEffect, useMemo, useState } from 'react'
import { ImageSquare, Plus, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { GENRE_CATALOG, MAX_GENRE_LENGTH, MAX_SERIES_GENRES, normalizeGenre } from '@/lib/genreCatalog'
import {
  submitFansubMangaRevision,
  type FansubManageManga,
  type FansubMangaRevisionChanges,
} from '@/services/fansubManageService'
import { uploadMangaCover } from '@/services/storageService'
import { toast } from '@/services/toastService'
import { txa, intlLocale } from '@/i18n/activeLocale'

type SeriesStatus = 'ongoing' | 'completed' | 'hiatus'

const STATUS_OPTIONS: Array<{ id: SeriesStatus; label: string }> = [
  { id: 'ongoing', get label() { return txa('Devam ediyor') } },
  { id: 'completed', get label() { return txa('Tamamlandı') } },
  { id: 'hiatus', get label() { return txa('Ara verdi') } },
]

export const FIELD_LABELS: Record<string, string> = {
  get title() { return txa('Ad') },
  get description() { return txa('Açıklama') },
  get genres() { return txa('Türler') },
  get cover_image_url() { return txa('Kapak') },
  is_mature: '+18',
  status: 'Yayın durumu',
  get author() { return txa('Yazar') },
  get artist() { return txa('Çizer') },
}

interface Draft {
  title: string
  author: string
  artist: string
  status: SeriesStatus
  description: string
  genres: string[]
  isMature: boolean
}

function toDraft(manga: FansubManageManga): Draft {
  return {
    title: manga.title,
    author: manga.author || '',
    artist: manga.artist || '',
    status: manga.status,
    description: manga.description || '',
    genres: [...manga.genres],
    isMature: manga.isMature === true,
  }
}

export default function FansubMangaRevisionDialog({
  open,
  onOpenChange,
  fansubId,
  manga,
  hasPendingRequest,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fansubId: string
  manga: FansubManageManga | null
  /** If a request is pending, a new one replaces it; the user is told. */
  hasPendingRequest: boolean
  onSubmitted: () => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [genreInput, setGenreInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !manga) return
    setDraft(toDraft(manga))
    setCover(null)
    setNote('')
    setGenreInput('')
  }, [open, manga])

  useEffect(() => {
    if (!cover) { setCoverPreview(null); return undefined }
    const url = URL.createObjectURL(cover)
    setCoverPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [cover])

  const changes = useMemo<FansubMangaRevisionChanges>(() => {
    if (!draft || !manga) return {}
    const next: FansubMangaRevisionChanges = {}
    if (draft.title.trim() && draft.title.trim() !== manga.title) next.title = draft.title.trim()
    if (draft.author.trim() !== (manga.author || '')) next.author = draft.author.trim()
    if (draft.artist.trim() !== (manga.artist || '')) next.artist = draft.artist.trim()
    if (draft.status !== manga.status) next.status = draft.status
    if (draft.description.trim() !== (manga.description || '').trim()) next.description = draft.description.trim()
    if (draft.genres.join('|') !== manga.genres.join('|')) next.genres = draft.genres
    if (draft.isMature !== (manga.isMature === true)) next.is_mature = draft.isMature
    return next
  }, [draft, manga])

  const changedKeys = [...Object.keys(changes), ...(cover ? ['cover_image_url'] : [])]
  const suggestions = useMemo(() => {
    const term = genreInput.trim().toLocaleLowerCase(intlLocale())
    if (!term || !draft) return []
    return GENRE_CATALOG.filter((genre) => genre.toLocaleLowerCase(intlLocale()).includes(term) && !draft.genres.includes(genre)).slice(0, 6)
  }, [genreInput, draft])

  if (!manga || !draft) return null

  const addGenre = (raw: string) => {
    const genre = normalizeGenre(raw).slice(0, MAX_GENRE_LENGTH)
    if (!genre || draft.genres.includes(genre) || draft.genres.length >= MAX_SERIES_GENRES) return
    setDraft({ ...draft, genres: [...draft.genres, genre] })
    setGenreInput('')
  }

  const handleSubmit = async () => {
    if (!changedKeys.length) return
    setSaving(true)
    try {
      const payload: FansubMangaRevisionChanges = { ...changes }
      if (cover) {
        payload.cover_image_url = await uploadMangaCover(cover, { fansubId, mangaId: manga.id, draftKey: `duzeltme-${crypto.randomUUID()}` })
      }
      await submitFansubMangaRevision({ fansubId, mangaId: manga.id, changes: payload, note })
      toast.success(txa('Düzeltme isteğin onaya gönderildi. Onaylanana kadar okurlar eski bilgiyi görür.'))
      onSubmitted()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Düzeltme gönderilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const changed = (key: string) => changedKeys.includes(key)
  const fieldClass = (key: string) => cn(changed(key) && 'border-primary/60 ring-1 ring-primary/20')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(calc(100dvh-1rem),820px)] w-[min(720px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="text-lg">{txa('Düzeltme iste · {v1}', { v1: manga.title })}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {txa('Yalnız değiştirdiğin alanlar site yönetiminin onayına gider; onaylanana kadar seri olduğu gibi kalır.')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <Label>{txa('Kapak')}</Label>
            <label className={cn('group relative block aspect-[3/4] cursor-pointer overflow-hidden rounded-xl border bg-muted', changed('cover_image_url') ? 'border-primary/60' : 'border-border/70')}>
              <img src={coverPreview || manga.coverImageUrl || buildCoverPlaceholder(manga.title)} alt="" className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1.5 text-[11.5px] font-semibold text-white opacity-90 group-hover:opacity-100">
                <ImageSquare size={13} />{cover ? txa('Değiştir') : txa('Yeni kapak')}
              </span>
              <input type="file" accept="image/*" className="sr-only" onChange={(event) => setCover(event.target.files?.[0] || null)} />
            </label>
            {cover && (
              <button type="button" className="text-left text-[11.5px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => setCover(null)}>
                {txa('Yeni kapağı kaldır')}
              </button>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="rev-title">{txa('Seri adı')}</Label>
              <Input id="rev-title" value={draft.title} maxLength={200} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={fieldClass('title')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rev-author">{txa('Yazar')}</Label>
                <Input id="rev-author" value={draft.author} maxLength={120} placeholder={txa('Bilinmiyor')} onChange={(event) => setDraft({ ...draft, author: event.target.value })} className={fieldClass('author')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rev-artist">{txa('Çizer')}</Label>
                <Input id="rev-artist" value={draft.artist} maxLength={120} placeholder={txa('Bilinmiyor')} onChange={(event) => setDraft({ ...draft, artist: event.target.value })} className={fieldClass('artist')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{txa('Yayın durumu')}</Label>
              <div className={cn('grid grid-cols-3 gap-1 rounded-xl border bg-muted/30 p-1', changed('status') ? 'border-primary/60' : 'border-border/70')} role="radiogroup" aria-label={txa('Yayın durumu')}>
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={draft.status === option.id}
                    onClick={() => setDraft({ ...draft, status: option.id })}
                    className={cn('rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition-colors', draft.status === option.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="rev-genre">{txa('Türler')}</Label>
                <span className="text-[11.5px] tabular-nums text-muted-foreground">{draft.genres.length}/{MAX_SERIES_GENRES}</span>
              </div>
              <div className={cn('flex flex-wrap gap-1.5 rounded-xl border p-2', changed('genres') ? 'border-primary/60' : 'border-border/70')}>
                {draft.genres.map((genre) => (
                  <span key={genre} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold">
                    {genre}
                    <button type="button" aria-label={txa('{v1} türünü çıkar', { v1: genre })} onClick={() => setDraft({ ...draft, genres: draft.genres.filter((entry) => entry !== genre) })} className="text-muted-foreground hover:text-foreground">
                      <X size={11} weight="bold" />
                    </button>
                  </span>
                ))}
                <input
                  id="rev-genre"
                  value={genreInput}
                  onChange={(event) => setGenreInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addGenre(genreInput) }
                  }}
                  placeholder={draft.genres.length >= MAX_SERIES_GENRES ? txa('Tür sınırı doldu') : txa('Tür ekle…')}
                  disabled={draft.genres.length >= MAX_SERIES_GENRES}
                  className="min-w-[110px] flex-1 bg-transparent px-1 text-[12.5px] outline-none"
                />
              </div>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {suggestions.map((genre) => (
                    <button key={genre} type="button" onClick={() => addGenre(genre)} className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11.5px] text-muted-foreground hover:text-foreground">
                      <Plus size={10} weight="bold" />{genre}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rev-desc">{txa('Açıklama')}</Label>
              <Textarea id="rev-desc" value={draft.description} maxLength={5000} rows={4} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={fieldClass('description')} />
            </div>
            <label className={cn('flex items-center justify-between gap-3 rounded-xl border px-3 py-2', changed('is_mature') ? 'border-primary/60' : 'border-border/70')}>
              <span>
                <span className="block text-[13px] font-semibold">{txa('+18 içerik')}</span>
                <span className="block text-[11.5px] text-muted-foreground">{txa('Yetişkin içerik uyarısı ve yaş doğrulaması açılır.')}</span>
              </span>
              <Switch checked={draft.isMature} onCheckedChange={(isMature) => setDraft({ ...draft, isMature })} />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="rev-note">{txa('Yönetime not')}</Label>
              <Textarea id="rev-note" value={note} maxLength={500} rows={2} onChange={(event) => setNote(event.target.value)} placeholder={txa('Neyi neden düzelttiğini kısaca yaz (ör. yazar adı yanlış yazılmış).')} />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 border-t border-border/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-muted-foreground">
            {changedKeys.length
              ? <>{txa('Değişen:')}{' '}<b className="text-foreground">{changedKeys.map((key) => FIELD_LABELS[key] || key).join(', ')}</b></>
              : txa('Henüz bir alan değiştirmedin.')}
            {hasPendingRequest ? txa('· Bekleyen isteğin bununla değişir.') : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>{txa('İptal')}</Button>
            <Button type="button" disabled={saving || !changedKeys.length || !draft.title.trim()} onClick={() => void handleSubmit()}>
              {saving ? txa('Gönderiliyor…') : txa('Onaya gönder')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
