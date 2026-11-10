/**
 * Phase 2 rich catalog seed data (deterministic, presentable, SFW).
 *
 * This module is shared by the cover generator (generate-catalog-covers) and the DB seed
 * (seed-rich-catalog). Images are programmatic gradient covers;
 * each manga is tied to a fansub and theme color.
 *
 * ID scheme (to separate from real user data):
 * fansub  : 7a000000-0000-4000-8000-0000000000NN
 * manga   : 7a100000-0000-4000-8000-0000000000NN
 */

const TR_MAP = { ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u' }

export function slugify(value) {
  return String(value || '')
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TR_MAP[ch] || ch)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Public path of generated covers (the generator writes, the seed references).
export function coverPathFor(title) {
  return `/covers/generated/${slugify(title)}.webp`
}

export const CATALOG_FANSUBS = [
  { key: 'geceyarisi', name: 'Gece Yarisi Ceviri', slug: 'gece-yarisi-ceviri', color: '#6366f1', desc: 'Karanlik basinca ceviren ekip; aksiyon ve gizem agirlikli.' },
  { key: 'sakura', name: 'Sakura Scans', slug: 'sakura-scans', color: '#ec4899', desc: 'Romantik ve slice-of-life serilerinde uzman gonullu ceviri ekibi.' },
  { key: 'ejderha', name: 'Ejderha Atolyesi', slug: 'ejderha-atolyesi', color: '#f59e0b', desc: 'Yuksek fantazi ve epik maceralar; ozenli dizgi.' },
  { key: 'anka', name: 'Anka Ceviri', slug: 'anka-ceviri', color: '#ef4444', desc: 'Kulden dogan seriler; dovus ve guc sistemleri.' },
  { key: 'karakoridor', name: 'Karanlik Koridor', slug: 'karanlik-koridor', color: '#14b8a6', desc: 'Korku, gerilim ve dogaustu; gece okunur.' },
  { key: 'yildiz', name: 'Yildiz Fansub', slug: 'yildiz-fansub', color: '#0ea5e9', desc: 'Bilim kurgu ve uzay operalarinda iddiali ekip.' },
]

// Helper theme colors to derive a cover gradient from the genre palette
const G = {
  aksiyon: '#ef4444', fantastik: '#8b5cf6', romantik: '#ec4899', gizem: '#6366f1',
  korku: '#0f766e', bilimkurgu: '#0ea5e9', sliceoflife: '#22c55e', dogaustu: '#a855f7',
  tarihi: '#b45309', spor: '#f97316', dram: '#64748b', macera: '#f59e0b',
}

export const CATALOG_MANGAS = [
  { title: 'Kor Bicagin Yemini', genres: ['Aksiyon', 'Gizem'], fansub: 'geceyarisi', color: G.aksiyon, author: 'Deniz Aydin', status: 'ongoing', synopsis: 'Hafizasini yitirmis bir suikastci, kendi gecmisinin izini surerken sehrin altindaki kanli duzeni kesfeder.' },
  { title: 'Solgun Ay Guncesi', genres: ['Dram', 'Slice of Life'], fansub: 'sakura', color: G.sliceoflife, author: 'Elif Korkmaz', status: 'ongoing', synopsis: 'Gece vardiyasinda calisan bir kuryenin sakin ama huzunlu sokak hikayeleri.' },
  { title: 'Ejderha Mahkemesi', genres: ['Fantastik', 'Tarihi'], fansub: 'ejderha', color: G.fantastik, author: 'Baris Tan', status: 'ongoing', synopsis: 'Saray entrikalari ve yasak buyu arasinda ayakta kalmaya calisan bir muhafiz.' },
  { title: 'Yildizlarin Otesinde', genres: ['Bilim Kurgu', 'Macera'], fansub: 'yildiz', color: G.bilimkurgu, author: 'Mert Uysal', status: 'ongoing', synopsis: 'Cokmus bir kolonide uyanan pilot, insanligin son filosunu aramaya cikar.' },
  { title: 'Fisilti Ormani', genres: ['Korku', 'Gizem'], fansub: 'karakoridor', color: G.korku, author: 'Selin Ari', status: 'ongoing', synopsis: 'Kaybolan cocuklarin izi, fisildayan agaclarin oldugu lanetli bir ormana cikar.' },
  { title: 'Kizil Ruzgar', genres: ['Aksiyon', 'Macera'], fansub: 'anka', color: G.aksiyon, author: 'Kaan Eris', status: 'ongoing', synopsis: 'Col kabilelerinin arasinda buyuyen bir yetim, ruzgari kontrol etme gucuyle uyanir.' },
  { title: 'Cam Kalpler', genres: ['Romantik', 'Dram'], fansub: 'sakura', color: G.romantik, author: 'Ada Yilmaz', status: 'ongoing', synopsis: 'Iki rakip piyanistin yaris ile ask arasinda gidip gelen hikayesi.' },
  { title: 'Sonsuz Bahce', genres: ['Fantastik', 'Doğaüstü'], fansub: 'ejderha', color: G.dogaustu, author: 'Cem Aksoy', status: 'ongoing', synopsis: 'Her gece yeniden buyuyen bir bahcenin bekcisi, zamanin sirrini cozmeye calisir.' },
  { title: 'Celik Surgun', genres: ['Bilim Kurgu', 'Aksiyon'], fansub: 'yildiz', color: G.bilimkurgu, author: 'Ozan Demir', status: 'ongoing', synopsis: 'Bedenini makineyle degistiren bir suclu, kendisini yaratan sirketi devirmeyi amaclar.' },
  { title: 'Gece Pazari', genres: ['Gizem', 'Doğaüstü'], fansub: 'geceyarisi', color: G.gizem, author: 'Nil Ozturk', status: 'ongoing', synopsis: 'Yalniz gece yarisi acilan bir pazarda her sey satilik; hatta anilar bile.' },
  { title: 'Kirik Tac', genres: ['Fantastik', 'Dram'], fansub: 'ejderha', color: G.fantastik, author: 'Burak Sahin', status: 'ongoing', synopsis: 'Tahttan dusen bir prenses, kaybettigi kralligi geri almak icin yasak ittifaklar kurar.' },
  { title: 'Son Buyucu', genres: ['Fantastik', 'Macera'], fansub: 'anka', color: G.macera, author: 'Yagmur Kaya', status: 'ongoing', synopsis: 'Buyunun yok oldugu bir cagda, son buyucu cirakligini gizlice surdurur.' },
  { title: 'Mavi Saat', genres: ['Romantik', 'Slice of Life'], fansub: 'sakura', color: G.romantik, author: 'Defne Acar', status: 'ongoing', synopsis: 'Bir kahvecide her gun ayni saatte karsilasan iki yabancinin sessiz hikayesi.' },
  { title: 'Karanlik Devriye', genres: ['Korku', 'Aksiyon'], fansub: 'karakoridor', color: G.korku, author: 'Tunc Er', status: 'ongoing', synopsis: 'Gece bekcileri, sehre sizan goreleri avlarken kendi korkulariyla yuzlesir.' },
  { title: 'Ruzgar Loncasi', genres: ['Macera', 'Fantastik'], fansub: 'ejderha', color: G.macera, author: 'Irmak Sen', status: 'ongoing', synopsis: 'Gokyuzu gemileriyle ada ada gezen bir loncanin son seferi.' },
  { title: 'Yedinci Kat', genres: ['Gizem', 'Korku'], fansub: 'karakoridor', color: G.gizem, author: 'Pelin Gok', status: 'ongoing', synopsis: 'Asansorun hic durmadigi yedinci kat, her gece farkli bir kabusa acilir.' },
  { title: 'Demir Kan', genres: ['Aksiyon', 'Tarihi'], fansub: 'anka', color: G.tarihi, author: 'Sarp Ulu', status: 'ongoing', synopsis: 'Demirci bir ailenin oglu, isgal altindaki sehrinde direnisin sembolu olur.' },
  { title: 'Sakura Mevsimi', genres: ['Romantik', 'Spor'], fansub: 'sakura', color: G.spor, author: 'Lal Demir', status: 'ongoing', synopsis: 'Okul tenis takiminda parlayan iki rakibin bahar boyu suren rekabeti.' },
  { title: 'Golgelerin Muhru', genres: ['Fantastik', 'Gizem'], fansub: 'geceyarisi', color: G.fantastik, author: 'Aras Bilge', status: 'ongoing', synopsis: 'Golgesini kaybeden bir genc, onu calan varligin pesine duser.' },
  { title: 'Nova Protokolu', genres: ['Bilim Kurgu', 'Gizem'], fansub: 'yildiz', color: G.bilimkurgu, author: 'Eren Yalin', status: 'ongoing', synopsis: 'Bir yapay zeka, yaraticisinin olumunu cozmek icin insanligi taklit etmeye baslar.' },
  { title: 'Safak Avcisi', genres: ['Aksiyon', 'Doğaüstü'], fansub: 'anka', color: G.aksiyon, author: 'Sample Author', status: 'ongoing', synopsis: 'Kiyamet sonrasi sehirde iz suren genc bir avcinin kayip hafiza yolculugu.' },
  { title: 'Bulut Ustu Sehir', genres: ['Macera', 'Slice of Life'], fansub: 'ejderha', color: G.macera, author: 'Su Naz', status: 'ongoing', synopsis: 'Bulutlarin uzerinde yuzen bir sehirde buyuyen cocuklarin gunluk maceralari.' },
  { title: 'Kara Kule Arsivi', genres: ['Fantastik', 'Gizem'], fansub: 'geceyarisi', color: G.gizem, author: 'Hira Tas', status: 'ongoing', synopsis: 'Her katinda bir sir saklayan kara kuleyi tirmanmaya calisan kasifler.' },
  { title: 'Kalp Atisi 120', genres: ['Spor', 'Dram'], fansub: 'sakura', color: G.spor, author: 'Doruk Al', status: 'ongoing', synopsis: 'Kalbinde sorun olan bir kosucunun olimpiyat hayaliyle verdigi mucadele.' },
  { title: 'Buz Kraliyeti', genres: ['Fantastik', 'Romantik'], fansub: 'ejderha', color: G.fantastik, author: 'Naz Erk', status: 'ongoing', synopsis: 'Ebedi kis altindaki bir kraliyette, baharı geri getirmesi beklenen bir prenses.' },
  { title: 'Sessiz Frekans', genres: ['Bilim Kurgu', 'Korku'], fansub: 'yildiz', color: G.bilimkurgu, author: 'Tarik Onal', status: 'ongoing', synopsis: 'Uzayda bir sinyali takip eden murettebat, sessizligin ardindaki seyle karsilasir.' },
  { title: 'Lunapark Geceleri', genres: ['Gizem', 'Doğaüstü'], fansub: 'karakoridor', color: G.dogaustu, author: 'Ece Vural', status: 'ongoing', synopsis: 'Terk edilmis bir lunaparkta her gece bir bilet daha eksilir.' },
  { title: 'Altin Lonca', genres: ['Macera', 'Aksiyon'], fansub: 'anka', color: G.macera, author: 'Kerem Boz', status: 'ongoing', synopsis: 'Hazine avcilarinin altin loncasinda yukselmeye calisan acemi bir ikili.' },
  { title: 'Yagmur Defteri', genres: ['Romantik', 'Dram'], fansub: 'sakura', color: G.romantik, author: 'Melis Gun', status: 'ongoing', synopsis: 'Her yagmurda farkli bir ani hatirlatan gizemli bir defterin hikayesi.' },
  { title: 'Volkan Cocuklari', genres: ['Aksiyon', 'Fantastik'], fansub: 'ejderha', color: G.aksiyon, author: 'Alp Kaya', status: 'ongoing', synopsis: 'Volkanin icinde dogan cocuklar, atese hukmetme gucleriyle dunyayi degistirir.' },
]
