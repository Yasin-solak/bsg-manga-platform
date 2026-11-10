import { Upload, X } from 'lucide-react'
import {
  SERIES_TYPES,
  type AdminMangaControlDetail,
  type SeriesType,
} from '@/services/adminService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { txa } from '@/i18n/activeLocale'

/**
 * Details editing: cover, genres, description.
 *
 * In the old window these three forms were in separately titled, framed, gray boxes and
 * shared the "General" tab with metrics. Here there is one editing surface:
 * each field is a plain section, with the save button beside its own field.
 *
 * NO frame/background between fields: stacked gray boxes were the main reason
 * the window looked messy.
 */

const SERIES_TYPE_LABELS: Record<SeriesType, string> = {
  get manga() { return txa('Manga (Japonya)') },
  get manhwa() { return txa('Manhwa (Kore)') },
  get manhua() { return txa('Manhua (Cin)') },
  get webtoon() { return txa('Webtoon (dikey)') },
  get yerli() { return txa('Yerli üretim') },
}

interface MangaDetailMetaPanelProps {
  detail: AdminMangaControlDetail
  seriesTypeDraft: SeriesType
  onSeriesTypeChange: (value: SeriesType) => void
  savingSeriesType: boolean
  onSaveSeriesType: () => void | Promise<void>
  matureDraft: boolean
  onMatureChange: (value: boolean) => void
  savingMature: boolean
  onSaveMature: () => void | Promise<void>
  coverPreview: string | null
  coverFile: File | null
  coverSaving: boolean
  coverInputRef: React.RefObject<HTMLInputElement | null>
  onCoverInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onSaveCover: () => void | Promise<void>
  onClearCoverSelection: () => void
  genreInput: string
  onGenreInputChange: (value: string) => void
  genreDraft: string[]
  savingGenres: boolean
  onAddGenre: () => void
  onRemoveGenre: (genre: string) => void
  onSaveGenres: () => void | Promise<void>
  descriptionDraft: string
  onDescriptionDraftChange: (value: string) => void
  onSaveDescription: () => void | Promise<void>
  savingDescription: boolean
}

export function MangaDetailMetaPanel({
  detail,
  seriesTypeDraft,
  onSeriesTypeChange,
  savingSeriesType,
  onSaveSeriesType,
  matureDraft,
  onMatureChange,
  savingMature,
  onSaveMature,
  coverPreview,
  coverFile,
  coverSaving,
  coverInputRef,
  onCoverInputChange,
  onSaveCover,
  onClearCoverSelection,
  genreInput,
  onGenreInputChange,
  genreDraft,
  savingGenres,
  onAddGenre,
  onRemoveGenre,
  onSaveGenres,
  descriptionDraft,
  onDescriptionDraftChange,
  onSaveDescription,
  savingDescription,
}: MangaDetailMetaPanelProps) {
  return (
    <div className="space-y-5" data-testid="admin-manga-meta-panel">
      <section className="space-y-2">
        <FieldLabel title={txa('Kapak')} hint={txa('JPEG, PNG ya da WebP.')} />
        <div className="flex items-start gap-3">
          <img
            loading="lazy"
            decoding="async"
            src={coverPreview || detail.coverImageUrl}
            alt=""
            className="h-[118px] w-[84px] shrink-0 rounded-md border border-border object-cover"
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              ref={coverInputRef as React.RefObject<HTMLInputElement>}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onCoverInputChange}
              className="hidden"
            />
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => coverInputRef.current?.click()}>
              <Upload className="size-3.5" aria-hidden="true" />
              {coverFile ? txa('Başka dosya seç') : txa('Dosya seç')}
            </Button>
            {coverFile ? (
              <>
                <Button type="button" size="sm" className="min-h-11" disabled={coverSaving} onClick={() => { void onSaveCover() }}>
                  {coverSaving ? txa('Kaydediliyor…') : txa('Kapağı kaydet')}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onClearCoverSelection}>
                  {txa('Vazgec')}
                </Button>
                <span className="w-full truncate text-[11px] text-muted-foreground">{coverFile.name}</span>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <FieldLabel title={txa('Türler')} hint={txa('{v1}/20 · Enter ile ekleyebilirsin.', { v1: genreDraft.length })} />
        <div className="flex flex-wrap gap-2">
          <Input
            value={genreInput}
            onChange={(event) => onGenreInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              onAddGenre()
            }}
            placeholder={txa('Tür adı…')}
            className="h-11 min-w-[180px] flex-1"
            aria-label={txa('Eklenecek tür adı')}
          />
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onAddGenre}>{txa('Ekle')}</Button>
          <Button type="button" size="sm" className="min-h-11" disabled={savingGenres} onClick={() => { void onSaveGenres() }}>
            {savingGenres ? txa('Kaydediliyor…') : txa('Türleri kaydet')}
          </Button>
        </div>
        {genreDraft.length === 0 ? (
          <p className="m-0 text-[11px] text-muted-foreground">{txa('Tür eklenmemiş — katalog kartları ve filtreler bundan etkilenir.')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {genreDraft.map((genre) => (
              <Badge key={genre} variant="secondary" className="gap-1 rounded-full py-1 pl-2.5 pr-1 text-[11px]">
                {genre}
                <button
                  type="button"
                  onClick={() => onRemoveGenre(genre)}
                  aria-label={txa('{v1} türünü kaldır', { v1: genre })}
                  className="rounded-full p-0.5 transition-colors hover:bg-background/60"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/*
        Seri turu ve 18+ birlikte duruyor: ikisi de "bu seri NE" sorusunun
        cevabi ve ikisi de yukleme aninda bilinmeli.
      */}
      <section className="space-y-2">
        <FieldLabel
          title={txa('Seri türü')}
          hint={txa('Kaynak dili değil, serinin ne olduğu. Keşfet filtrelerinde kullanılır.')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={seriesTypeDraft}
            onChange={(event) => onSeriesTypeChange(event.target.value as SeriesType)}
            aria-label={txa('Seri türü')}
            className="h-11 min-w-[180px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
          >
            {SERIES_TYPES.map((value) => (
              <option key={value} value={value}>{SERIES_TYPE_LABELS[value]}</option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={savingSeriesType || seriesTypeDraft === detail.seriesType}
            onClick={() => { void onSaveSeriesType() }}
          >
            {savingSeriesType ? txa('Kaydediliyor…') : txa('Türü kaydet')}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <FieldLabel
          title={txa('Yetişkin içerik (18+)')}
          hint={txa('18 yaşından küçük ya da doğum tarihi bilinmeyen kullanıcılar bu seriyi göremez.')}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={matureDraft}
              onChange={(event) => onMatureChange(event.target.checked)}
              className="size-4"
            />
            {txa('18+ olarak isaretle')}
          </label>
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={savingMature || matureDraft === detail.isMature}
            onClick={() => { void onSaveMature() }}
          >
            {savingMature ? txa('Kaydediliyor…') : txa('İşareti kaydet')}
          </Button>
        </div>
        {/*
          Bu uyari kozmetik degil: bayrak RLS kapisinin anahtari, yani
          isaretlemek seriyi bir kullanici kitlesinden TAMAMEN gizler.
        */}
        <p className="m-0 text-[11px] text-muted-foreground">
          {txa('Gorunurluk veritabani seviyesinde uygulanir; isaretli seri ve bolumleri yasi dogrulanmamis kullaniciya hic donmez.')}
        </p>
      </section>

      <section className="space-y-2">
        <FieldLabel title={txa('Açıklama')} hint={txa('Seri sayfasında ve arama sonuçlarında görünür.')} />
        <Textarea
          value={descriptionDraft}
          onChange={(event) => onDescriptionDraftChange(event.target.value)}
          className="min-h-[140px] w-full resize-y"
          placeholder={txa('Seri hakkında kısa bir tanıtım…')}
          aria-label={txa('Seri açıklaması')}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{descriptionDraft.length}{' '}{txa('karakter')}</span>
          <Button type="button" size="sm" className="min-h-11" disabled={savingDescription} onClick={() => { void onSaveDescription() }}>
            {savingDescription ? txa('Kaydediliyor…') : txa('Açıklamayı kaydet')}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <FieldLabel
          title={txa('Çeviriye katılan ekipler')}
          hint={txa('Bilgi amaçlı — sahiplik değil; her fansub bu seriye çeviri yükleyebilir.')}
        />
        {detail.chapterContributorFansubs.length === 0 ? (
          <p className="m-0 text-[11px] text-muted-foreground">{txa('Henüz çeviri yükleyen ekip yok.')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.chapterContributorFansubs.map((fansub) => (
              <Badge key={fansub.id} variant="outline" className="rounded-full text-[11px]">
                {fansub.name}
              </Badge>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function FieldLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h4 className="m-0 font-heading text-sm text-foreground">{title}</h4>
      <p className="m-0 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
