import { txa } from '@/i18n/activeLocale'
/*
 * Series genre / tag catalog (Translation Studio series draft). Matches existing spellings on the
 * site (Dram, Fantastik, Dogaustu ...); genres outside the catalog can be added freely, and the
 * admin sees them at series approval. Synonym spellings (Drama -> Dram) map to one genre.
 */

export interface GenreGroup { title: string, genres: string[] }

export const GENRE_GROUPS: GenreGroup[] = [
  {
    get title() { return txa('Ana türler') },
    genres: ['Aksiyon', 'Macera', 'Komedi', 'Dram', 'Fantastik', 'Romantik', 'Gizem', 'Korku', 'Gerilim', 'Bilim Kurgu', 'Doğaüstü', 'Psikolojik', 'Slice of Life', 'Tarihi', 'Spor', 'Okul', 'Trajedi', 'Suç', 'Polisiye', 'Savaş'],
  },
  {
    get title() { return txa('Hedef kitle') },
    genres: ['Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kodomo'],
  },
  {
    get title() { return txa('Fantastik ve dünya') },
    genres: ['Isekai', 'Reenkarnasyon', 'Geri Dönüş (Regresyon)', 'Zaman Yolculuğu', 'Sistem', 'Oyun Dünyası', 'Zindan', 'Kule', 'Büyü', 'Büyücü', 'Şövalye', 'Ejderha', 'Canavar', 'Elf', 'Cüce', 'İblis', 'Melek', 'Tanrı', 'Mitoloji', 'Kılıç ve Büyü', 'Karanlık Fantastik', 'Yüksek Fantastik', 'Kıyamet Sonrası', 'Distopya', 'Ütopya'],
  },
  {
    get title() { return txa('Doğu Asya') },
    genres: ['Murim', 'Wuxia', 'Xianxia', 'Xuanhuan', 'Kultivasyon', 'Dövüş Sanatları', 'Samuray', 'Ninja', 'Yokai', 'Saray', 'İmparatorluk'],
  },
  {
    get title() { return txa('Bilim kurgu') },
    genres: ['Mecha', 'Uzay', 'Siberpunk', 'Steampunk', 'Yapay Zekâ', 'Robot', 'Uzaylı', 'Süper Güç', 'Süper Kahraman', 'Mutant', 'Virüs', 'Zombi', 'Hayatta Kalma', 'Deney'],
  },
  {
    get title() { return txa('Romantik ve ilişki') },
    genres: ['Romantik Komedi', 'Aşk Üçgeni', 'Harem', 'Ters Harem', 'Evlilik', 'Sözleşmeli Evlilik', 'İlk Aşk', 'Gençlik', 'Ofis Romantizmi', 'Kötü Kadın (Villainess)', 'Soylu', 'Prens / Prenses', 'Boys Love', 'Girls Love', 'Aile'],
  },
  {
    get title() { return txa('Konu ve ortam') },
    genres: ['İntikam', 'Güç Fantezisi (OP Karakter)', 'Zayıftan Güçlüye', 'Yeniden Başlangıç', 'Kariyer', 'İş Hayatı', 'Yemek', 'Müzik', 'Sanat', 'İdol', 'Oyun', 'E-spor', 'Tıp', 'Hukuk', 'Dedektif', 'Mafya', 'Çete', 'Suikastçı', 'Askeri', 'Politik', 'Ekonomi', 'Kırsal Yaşam', 'Hayvanlar', 'Seyahat', 'Hapishane', 'Ölüm Oyunu', 'Anti Kahraman', 'Kötü Karakter Başrolde'],
  },
  {
    get title() { return txa('Ton ve biçim') },
    genres: ['Kara Mizah', 'Parodi', 'Hüzünlü', 'Duygusal', 'Karanlık', 'Vahşet (Gore)', 'Gizemli', 'Hafif', 'Tek Bölüm (Oneshot)', 'Antoloji', 'Webtoon', 'Renkli', '4-Koma', 'Uyarlama', 'Roman Uyarlaması'],
  },
]

export const GENRE_CATALOG: string[] = [...new Set(GENRE_GROUPS.flatMap((group) => group.genres))]

/** Synonyms / old spellings: so a second genre is not created on the site. */
export const GENRE_ALIASES: Record<string, string> = {
  get drama() { return txa('Dram') },
  get romantizm() { return txa('Romantik') },
  get romance() { return txa('Romantik') },
  get fantezi() { return txa('Fantastik') },
  get fantasy() { return txa('Fantastik') },
  get action() { return txa('Aksiyon') },
  get adventure() { return txa('Macera') },
  get comedy() { return txa('Komedi') },
  get horror() { return txa('Korku') },
  get mystery() { return txa('Gizem') },
  get 'sci-fi'() { return txa('Bilim Kurgu') },
  get 'bilim-kurgu'() { return txa('Bilim Kurgu') },
  get supernatural() { return txa('Doğaüstü') },
  get dogaustu() { return txa('Doğaüstü') },
  'günlük hayat': 'Slice of Life',
  'gunluk hayat': 'Slice of Life',
  get psychological() { return txa('Psikolojik') },
  get thriller() { return txa('Gerilim') },
  get historical() { return txa('Tarihi') },
  get sports() { return txa('Spor') },
  get school() { return txa('Okul') },
  'bl': 'Boys Love',
  'gl': 'Girls Love',
  'yaoi': 'Boys Love',
  'yuri': 'Girls Love',
}

export const MAX_SERIES_GENRES = 12
export const MAX_GENRE_LENGTH = 40

// Comparison folding: Turkish lowercase, ignoring dotted/dotless i differences
// ("ROMANTIZM" -> "romantızm" could not map to the synonym).
const fold = (value: string) => value.toLocaleLowerCase('tr').replace(/\u0131/g, 'i').replace(/\s+/g, ' ').trim()

/** Normalizes a genre typed by the user; the catalog or synonym spelling is preferred. */
export function normalizeGenre(input: string): string {
  const cleaned = input.replace(/\s+/g, ' ').trim().slice(0, MAX_GENRE_LENGTH)
  if (!cleaned) return ''
  const key = fold(cleaned)
  const alias = Object.entries(GENRE_ALIASES).find(([name]) => fold(name) === key)
  if (alias) return alias[1]
  const known = GENRE_CATALOG.find((genre) => fold(genre) === key)
  if (known) return known
  return cleaned.charAt(0).toLocaleUpperCase('tr') + cleaned.slice(1)
}

/** Search: catalog + genres used on the site, sorted by usage count. */
export function searchGenres(query: string, siteGenres: Array<{ genre: string, uses: number }>, limit = 40): string[] {
  const uses = new Map(siteGenres.map((entry) => [entry.genre, entry.uses]))
  const pool = [...new Set([...siteGenres.map((entry) => entry.genre), ...GENRE_CATALOG])]
  const key = fold(query)
  const matches = key ? pool.filter((genre) => fold(genre).includes(key)) : pool
  return matches
    .sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0) || (key ? Number(!fold(a).startsWith(key)) - Number(!fold(b).startsWith(key)) : 0))
    .slice(0, limit)
}
