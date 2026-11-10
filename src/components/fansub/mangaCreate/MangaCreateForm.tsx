/**
 * MangaCreateForm: presentation layer of the manga add form.
 *
 * Takes state/actions from the useMangaCreateForm hook. The same body is used in both the full
 * page and the in-studio modal; only the outer shell changes.
 */
import { Link } from '@/i18n/router'
import {
  BookPlus,
  ImagePlus,
  Info,
  Loader2,
  ScrollText,
  Sparkles,
  Tag,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { suppressAuthFocusSyncForNativeFileDialog } from '@/lib/nativeFileDialogFocus'
import { LANG_OPTIONS, STATUS_OPTIONS, type MangaCreateFormApi } from './useMangaCreateForm'
import { txa } from '@/i18n/activeLocale'

function SectionHeader({ icon: Icon, title }: { icon: typeof BookPlus; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
    </div>
  )
}

interface MangaCreateFormProps {
  form: MangaCreateFormApi
  /** modal: a more compact body; page: full page. */
  variant?: 'page' | 'modal'
  /** The cancel button renders as a Link (page). */
  cancelHref?: string
  /** The cancel button renders with onClick (modal). */
  onCancel?: () => void
}

export default function MangaCreateForm({ form, variant = 'page', cancelHref, onCancel }: MangaCreateFormProps) {
  const {
    fileInputRef,
    title,
    setTitle,
    altTitles,
    setAltTitles,
    coverFile,
    coverDisplay,
    coverSizeInfo,
    description,
    setDescription,
    author,
    setAuthor,
    artist,
    setArtist,
    status,
    setStatus,
    originalLang,
    setOriginalLang,
    releaseDate,
    setReleaseDate,
    genres,
    availableGenres,
    customGenreInput,
    setCustomGenreInput,
    tagInput,
    setTagInput,
    tags,
    isNew,
    setIsNew,
    loading,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    toggleGenre,
    addCustomGenre,
    addTag,
    removeTag,
    handleCoverChange,
    clearCover,
    statusLabel,
    langLabel,
    previewCard,
    isValid,
    submit,
  } = form

  return (
    <div
      className={cn(
        'space-y-6',
        variant === 'page'
          ? 'lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start lg:space-y-0'
          : 'xl:grid xl:grid-cols-[1fr_300px] xl:gap-6 xl:items-start xl:space-y-0',
      )}
    >
      <main className="min-w-0 space-y-6">
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {/* ─── 1. Temel Bilgiler ─── */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <SectionHeader icon={ScrollText} title={txa('Temel Bilgiler')} />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ma-title">
                  {txa('Baslik (Turkce)')}{' '}<span className="text-destructive">*</span>
                </Label>
                <Input id="ma-title" type="text" placeholder={txa('Orn. Golge Savascisi')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
                <span className="block text-xs text-muted-foreground">{title.length}/200</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ma-alt">{txa('Alternatif isimler')}</Label>
                <Input id="ma-alt" type="text" placeholder={txa('Virgul ile ayirin: Shadow Warrior, Kage Senshi')} value={altTitles} onChange={(e) => setAltTitles(e.target.value)} />
              </div>

              {/* Kapak yukleme — Drag & Drop */}
              <div className="space-y-1.5">
                <Label>{txa('Kapak gorseli')}</Label>
                <input ref={fileInputRef} type="file" accept="image/*" className="absolute h-0 w-0 opacity-0 pointer-events-none" onChange={handleCoverChange} aria-label={txa('Kapak yukle')} />
                <div
                  className={cn(
                    'rounded-xl border-2 border-dashed p-6 text-center transition-all',
                    isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/40',
                  )}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  <div className="mx-auto mb-3 w-[140px] aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted shadow-sm">
                    <img loading="lazy" decoding="async" src={coverDisplay} alt="" className="h-full w-full object-cover" />
                  </div>

                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        // The window blurs/focuses when the native file picker opens; unless we suppress the
                        // session sync on focus return, the studio remounts and it feels like "the page reloaded".
                        suppressAuthFocusSyncForNativeFileDialog()
                        fileInputRef.current?.click()
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {coverFile ? txa('Degistir') : txa('Kapak Yukle')}
                    </Button>
                    {coverFile && (
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={clearCover}>
                        <X className="h-3.5 w-3.5" />
                        {txa('Kaldir')}
                      </Button>
                    )}
                  </div>

                  {coverSizeInfo && <p className="mt-2 text-xs text-muted-foreground">{coverSizeInfo}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {txa('Surukle birak veya tikla. Onerilen oran 3:4 (orn. 300x400 px). Otomatik WebP sikistirilir.')}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ma-desc">
                  {txa('Aciklama')} <span className="text-destructive">*</span>
                </Label>
                <Textarea id="ma-desc" placeholder={txa('Manganin kisa ozeti, konusu...')} value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required className="min-h-[120px] resize-y" />
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ma-author">{txa('Yazar')}</Label>
                  <Input id="ma-author" type="text" placeholder={txa('Orn. Yamada Taro')} value={author} onChange={(e) => setAuthor(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ma-artist">{txa('Cizer')}</Label>
                  <Input id="ma-artist" type="text" placeholder={txa('Orn. Suzuki Hanako')} value={artist} onChange={(e) => setArtist(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ma-status">{txa('Durum')}</Label>
                  <select id="ma-status" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ma-lang">{txa('Orijinal dil')}</Label>
                  <select id="ma-lang" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={originalLang} onChange={(e) => setOriginalLang(e.target.value)}>
                    {LANG_OPTIONS.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ma-date">{txa('Yayin tarihi')}</Label>
                  <Input id="ma-date" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
                </div>
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} className="h-4 w-4 rounded border-border" />
                <Sparkles className="h-3.5 w-3.5 text-chart-4" />
                {txa('Yeni olarak isaretle (YENI rozeti)')}
              </label>
            </div>
          </section>

          {/* ─── 2. Turler ─── */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <SectionHeader icon={Tag} title={txa('Turler')} />
            <div className="mb-3 flex flex-wrap gap-2">
              {availableGenres.map((g) => {
                const selected = genres.some((item) => item.toLowerCase() === g.name.toLowerCase())
                return (
                  <Badge
                    key={g.id}
                    variant={selected ? 'default' : 'outline'}
                    className={cn('cursor-pointer transition-all hover:-translate-y-0.5', selected && 'bg-primary text-primary-foreground')}
                    onClick={() => toggleGenre(g.name)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && toggleGenre(g.name)}
                  >
                    {g.name}
                  </Badge>
                )
              })}
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={txa('Yeni tur ekle...')}
                value={customGenreInput}
                onChange={(e) => setCustomGenreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomGenre()
                  }
                }}
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={addCustomGenre}>
                {txa('Tur Ekle')}
              </Button>
            </div>
          </section>

          {/* ─── 3. Etiketler ─── */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <SectionHeader icon={Tag} title={txa('Etiketler')} />
            <div className="mb-3 flex gap-2">
              <Input
                type="text"
                placeholder={txa('Orn. Guclu MC, Zaman yolculugu')}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={addTag}>
                {txa('Ekle')}
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="inline-flex items-center gap-1 pr-1">
                    {t}
                    <button type="button" className="ml-1 rounded-full p-0.5 transition-colors hover:bg-destructive/20" onClick={() => removeTag(t)} aria-label={txa('{v1} kaldir', { v1: t })}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </section>

          {/* ─── Submit ─── */}
          <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-3 border-t border-border bg-background/85 px-1 py-3 backdrop-blur">
            {cancelHref ? (
              <Button asChild variant="outline">
                <Link to={cancelHref}>{txa('Iptal')}</Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onCancel}>
                {txa('Iptal')}
              </Button>
            )}
            <Button type="submit" disabled={!isValid} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookPlus className="h-4 w-4" />}
              {txa('Manga Ekle')}
            </Button>
          </div>
        </form>
      </main>

      {/* ─── Onizleme paneli ─── */}
      <aside className={cn('min-w-0 space-y-4', variant === 'page' ? 'lg:sticky lg:top-6' : 'xl:sticky xl:top-2')}>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{txa('Kart Onizlemesi')}</h3>
          </div>
          <article className="mx-auto max-w-[200px] overflow-hidden rounded-lg border border-border bg-muted shadow-sm">
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <img loading="lazy" decoding="async" src={previewCard.cover} alt="" className="h-full w-full object-cover" />
              {previewCard.isNew && (
                <div className="absolute top-2 -left-7 z-[2] w-[90px] rotate-[-45deg] bg-primary py-1 text-center text-[10px] font-semibold text-primary-foreground">{txa('YENI')}</div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3">
                <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white">{previewCard.title}</h3>
              </div>
            </div>
            <div className="border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">{txa('Son Bolum: --')}</div>
          </article>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{txa('Detay Onizlemesi')}</h3>
          </div>
          <div className="flex gap-3">
            <div className="aspect-[3/4] w-20 flex-shrink-0 overflow-hidden rounded-lg border border-border shadow-sm">
              <img loading="lazy" decoding="async" src={coverDisplay} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-base font-semibold leading-tight text-foreground">{title || txa('Baslik')}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{statusLabel}</p>
              {(author || artist) && <p className="text-xs text-muted-foreground">{[author, artist].filter(Boolean).join(' / ')}</p>}
              {originalLang && <p className="text-xs text-muted-foreground">{langLabel}</p>}
              {genres.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {genres.map((g) => (
                    <Badge key={g} variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {g}
                    </Badge>
                  ))}
                </div>
              )}
              {tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="mt-2 line-clamp-3 text-xs leading-snug text-foreground">{description?.trim() || txa('Aciklama girilmedi.')}</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  )
}
