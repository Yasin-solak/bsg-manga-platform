import {
  COMMUNITY_RULES_PATH,
  COPYRIGHT_POLICY_PATH,
  DMCA_PATH,
  ENFORCEMENT_POLICY_PATH,
  FANSUB_RULES_PATH,
  FAQ_PATH,
  HELP_CENTER_PATH,
  KVKK_PATH,
  POLICY_HUB_PATH,
  PRIVACY_PATH,
  REFUND_POLICY_PATH,
  STORE_RULES_PATH,
  TERMS_PATH,
} from '@/lib/policyRoutes'
import type { FaqItem, HelpCenterTopic, PolicyHubCategory, PolicyLinkItem } from './documentTypes'

export const POLICY_HUB_CATEGORIES: PolicyHubCategory[] = [
  {
    title: 'Yasal metinler',
    description: 'Hizmetin hukuki zemini, veri isleme ve resmi basvuru usulleri.',
    links: [
      { label: 'Kullanim Sartlari', to: TERMS_PATH },
      { label: 'Gizlilik Politikasi', to: PRIVACY_PATH },
      { label: 'KVKK Aydinlatma Metni', to: KVKK_PATH },
      { label: 'Telif ve Icerik Kaldirma', to: COPYRIGHT_POLICY_PATH },
      { label: 'DMCA Bildirimi', to: DMCA_PATH },
    ],
  },
  {
    title: 'Topluluk ve ekip kurallari',
    description: 'Topluluk duzeni, fansub yonetimi ve kamuya acik yaptirim mantigi.',
    links: [
      { label: 'Topluluk Kurallari', to: COMMUNITY_RULES_PATH },
      { label: 'Fansub Kurallari', to: FANSUB_RULES_PATH },
      { label: 'Yaptirim Politikasi', to: ENFORCEMENT_POLICY_PATH },
    ],
  },
  {
    title: 'Magaza ve coin merkezi',
    description: 'Coin, dijital urun lisansi, iade sinirlari ve teslim mantigi.',
    links: [
      { label: 'Magaza ve Coin Kurallari', to: STORE_RULES_PATH },
      { label: 'Iade / Iptal / Dijital Teslim', to: REFUND_POLICY_PATH },
    ],
  },
]

export const HELP_CENTER_TOPICS: HelpCenterTopic[] = [
  {
    title: 'Hesap ve guvenlik',
    description: 'Giris, hesap guvenligi, MFA ve hesap erisim sorunlari.',
    points: [
      'Giris veya kayit sureci sorunlari',
      'Hesap guvenligi, sifre ve MFA konulari',
      'Profil gorunurluk ve gizlilik tercihleri',
    ],
    relatedLinks: [
      { label: 'Kullanim Sartlari', to: TERMS_PATH },
      { label: 'Gizlilik Politikasi', to: PRIVACY_PATH },
    ],
  },
  {
    title: 'Topluluk ve moderasyon',
    description: 'Paylasim, yorum, raporlama ve kural ihlali sonuclari.',
    points: [
      'Topluluk paylasim ve yorum ilkeleri',
      'Moderasyon sonucu ve kademeli yaptirim mantigi',
      'Icerik kaldirma veya itiraz yonlendirmesi',
    ],
    relatedLinks: [
      { label: 'Topluluk Kurallari', to: COMMUNITY_RULES_PATH },
      { label: 'Yaptirim Politikasi', to: ENFORCEMENT_POLICY_PATH },
    ],
  },
  {
    title: 'Fansub ve ekip yonetimi',
    description: 'Fansub kurma, ekip yonetimi, iletisim ve telif hassasiyetleri.',
    points: [
      'Fansub basvurusu ve ekip sorumluluklari',
      'Ekip yetki ve cuzdan kullanim kurallari',
      'Telif ve hak sahipligi bildirimleri',
    ],
    relatedLinks: [
      { label: 'Fansub Kurallari', to: FANSUB_RULES_PATH },
      { label: 'Telif ve Icerik Kaldirma', to: COPYRIGHT_POLICY_PATH },
      { label: 'DMCA Bildirimi', to: DMCA_PATH },
    ],
  },
  {
    title: 'Magaza, coin ve dijital teslim',
    description: 'Coin yukleme, satin alma, hediye ve iade sinirlari.',
    points: [
      'Coin kodu ve bakiye hedefi mantigi',
      'Store urunu, hediye ve fansub envanter akislari',
      'Iade, iptal ve teknik sorun yonetimi',
    ],
    relatedLinks: [
      { label: 'Magaza ve Coin Kurallari', to: STORE_RULES_PATH },
      { label: 'Iade / Iptal / Dijital Teslim', to: REFUND_POLICY_PATH },
    ],
  },
]

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Topluluk gonderileri neden hemen yayinlanmiyor?',
    answer:
      'Topluluk paylasimlari ve belirli yorum yuzeyleri moderasyon akisindan gecebilir. Bu, spam, taciz, manipulasyon ve riskli linkleri azaltmak icin uygulanir.',
  },
  {
    question: 'Fansub kurmak icin hangi bilgileri vermem gerekiyor?',
    answer:
      'Fansub basvurusunda ekip adi, aciklama, yayin plani, ekip buyuklugu, iletisim ve telif/DMCA onayi gibi temel bilgiler istenir. Basvuru detayi fansub kurallari ile birlikte degerlendirilir.',
  },
  {
    question: 'Coin ile alinan urunler iade edilir mi?',
    answer:
      'Teslim edilen dijital urunler genel olarak nihai satistir. Teknik ariza, duplicate islem, fraud veya zorunlu mevzuat istisnalari incelemeli iade surecine girebilir.',
  },
  {
    question: 'Fansub kasasi ile satin alma ne anlama gelir?',
    answer:
      'Belirli urunlerde odeme kullanici bakiyesinden veya fansub kasasindan yapilabilir. Hedef ve odeme kaynagi ayrica dogrulanir; exploit veya kotuye kullanim agir ihlal sayilir.',
  },
  {
    question: 'Bir icerigi telif nedeniyle kaldirtmak istersem ne yapmaliyim?',
    answer:
      'Hak sahipligi veya yetki dayagi ile birlikte ilgili icerigin baglantisini, talep gerekcesini ve iletisim bilgilerinizi Telif ve Icerik Kaldirma ya da DMCA bildirim merkezindeki resmi form uzerinden iletmelisiniz.',
  },
  {
    question: 'Yaptirimlar herkese ayni sureyle mi uygulanir?',
    answer:
      'Hayir. Platform, ihlalin agirligi, tekrar orani, guvenlik riski ve verilen zarara gore kademeli degerlendirme yapar. Kamuya acik sayfada genel seviye anlatilir; ic operasyon matrisi yayimlanmaz.',
  },
  {
    question: 'DMCA bildirimi ile genel telif bildirimi arasindaki fark nedir?',
    answer:
      'DMCA bildirimi, telif hakki sahibi veya yetkili temsilcisi tarafindan yapilan daha resmi bir kaldirma talebidir. Genel telif bildirimi ise telif, marka, taklit veya benzeri hak ihlallerini daha genis kapsamda iletmek icin kullanilir.',
  },
  {
    question: 'Yasal talep formunu hesap acmadan doldurabilir miyim?',
    answer:
      'Evet. DMCA ve telif bildirim merkezi misafir kullanicilarin da resmi talep iletebilmesi icin aciktir. Ancak iletisim bilgileri, zorunlu beyanlar ve elektronik imza eksiksiz olmalidir.',
  },
  {
    question: 'Yasal talep gonderdikten sonra ne olur?',
    answer:
      'Talebiniz once kayda alinir, sonra turune ve icerigine gore inceleme kuyruguna duser. Gerekirse ek bilgi talep edilir; yeterli dayanak varsa kaldirma, gorunurluk kisiti veya uygun diger islem uygulanir.',
  },
  {
    question: 'Bir bildirimde birden fazla baglanti ekleyebilir miyim?',
    answer:
      'Evet. Ayni ihlale ait birden fazla icerik, profil, fansub veya sayfa baglantisini tek basvuruda ekleyebilirsiniz. Ancak aciklamada her baglantinin neden ihlal olusturdugu net sekilde belirtilmelidir.',
  },
  {
    question: 'Marka, taklit veya yanlis temsil sikayetleri de ayni merkezden mi iletilir?',
    answer:
      'Evet. Yasal talep merkezi sadece DMCA icin degil; marka ihlali, taklit profil, yanlis temsil ve benzeri hak temelli basvurular icin de kullanilir. Dogru talep turunu secmek inceleme hizini artirir.',
  },
  {
    question: 'Coin kodu etkinlestirdikten sonra bakiye hemen yuklenir mi?',
    answer:
      'Gecerli bir coin kodu basariyla etkinlestirildiginde bakiye genellikle hemen islenir. Teknik bir gecikme veya cakisali kayit olursa destek ekibi islem gecmisini inceleyerek gerekli duzeltmeyi yapar.',
  },
  {
    question: 'Hediye edilen dijital urunler geri alinabilir mi?',
    answer:
      'Basariyla teslim edilmis hediye urunler ve coin tuketimi kural olarak geri alinmaz. Yalnizca teknik hata, duplicate teslim, yetkisiz kullanim veya zorunlu mevzuat durumlarinda incelemeli istisna uygulanabilir.',
  },
  {
    question: 'Fansub kasasi ile kullanici bakiyesi arasindaki fark nedir?',
    answer:
      'Kullanici bakiyesi bireysel hesabiniz adina kullanilir. Fansub kasasi ise ekip adina kullanilan ve ekip yetki kurallarina tabi olan ortak kaynaktir. Satin alma sirasinda hangi kaynagin kullanildigi ayrica dogrulanir.',
  },
  {
    question: 'Fansub basvurum reddedilirse tekrar basvurabilir miyim?',
    answer:
      'Evet, ancak tekrar basvuru yapmadan once reddedilme gerekcesini dikkate alip eksik veya riskli bulunan kisimlari duzeltmeniz beklenir. Yinelenen ve ayni sorunlari tasiyan basvurular daha sert incelemeye girebilir.',
  },
  {
    question: 'Ekip yoneticileri ile normal ekip uyeleri ayni sorumluluga mi sahiptir?',
    answer:
      'Hayir. Ekip yoneticileri; yetki dagitimi, ekip kasasi, yayinlanan icerikler ve ekip adina yapilan resmi islemler konusunda ek sorumluluk tasir. Bu nedenle agir ihlallerde yonetici ayricaliklari ayri degerlendirilebilir.',
  },
  {
    question: 'Bir yorumum veya gonderim kaldirilirsa bunu nasil anlarim?',
    answer:
      'Icerik kaldirma veya gorunurluk kisiti uygulandiginda ilgili yuzeylerde durumunuzu etkileyen sonuc gorulebilir. Uygulama akisina gore bildirim, durum etiketi veya ilgili sayfaya yonlendirme ile neden ozetlenebilir.',
  },
  {
    question: 'Profilimi veya bazi bilgilerimi gizleyebilir miyim?',
    answer:
      'Platform, profil gorunurlugu ve belirli hesap bilgilerinin nasil sunulduguna dair ayarlar sunabilir. Veri isleme ve gorunurluk sinirlari icin Gizlilik Politikasi ile KVKK Aydinlatma Metni birlikte degerlendirilmelidir.',
  },
  {
    question: 'Iletisim ve Hata Bildir sayfasi ile Yasal Talep Merkezi arasindaki fark nedir?',
    answer:
      'Iletisim ve Hata Bildir sayfasi teknik sorunlar, hesap hatalari ve urun akislarindaki problemlere yoneliktir. Yasal Talep Merkezi ise DMCA, telif, marka, taklit ve resmi kaldirma taleplerini ayri kuyruga dusurmek icin kullanilir.',
  },
  {
    question: 'Topluluktaki duyurular ile normal gonderiler arasinda ne fark vardir?',
    answer:
      'Duyurular, belirli resmi veya operasyonel bilgilendirme amaciyla one cikartilabilen iceriklerdir. Normal gonderiler ise topluluk akisindaki standart kullanici veya fansub paylasimlaridir ve ayri oncelik kurallarina tabi olabilir.',
  },
  {
    question: 'Yaptirim kararlari otomatik mi veriliyor?',
    answer:
      'Platform belirli risk sinyallerini otomatik tespit edebilir; ancak agir yaptirimlar, hak ihlali talepleri ve ekip yonetimini etkileyen kararlar yalniz otomatik sonuca birakilmaz. Gerektiginde insan incelemesi ve ek baglam degerlendirmesi yapilir.',
  },
]

export const CONTACT_CARDS: Array<{
  title: string
  description: string
  points: string[]
  relatedLinks: PolicyLinkItem[]
}> = [
  {
    title: 'Destek ve hata bildirimi',
    description: 'Hesap, satin alma, teknik sorun ve is akisi aksakliklari icin kullanilir.',
    points: [
      'Sorunu net tanimlayin',
      'Mumkunse ekran goruntusu veya adim ekleyin',
      'Varsa ilgili kullanici, fansub veya icerik baglantisini belirtin',
    ],
    relatedLinks: [
      { label: 'Yardim Merkezi', to: HELP_CENTER_PATH },
      { label: 'SSS', to: FAQ_PATH },
    ],
  },
  {
    title: 'Kural, telif ve moderasyon basvurulari',
    description: 'Topluluk, fansub, telif, haksiz kaldirma veya yaptirim itirazlari icin kullanilir.',
    points: [
      'Basvurunun niteligini acik secin',
      'Baglantilar ve ilgili kayitlar ekleyin',
      'Hak sahibi veya temsilciyseniz bunu belirtin',
    ],
    relatedLinks: [
      { label: 'Telif ve Icerik Kaldirma', to: COPYRIGHT_POLICY_PATH },
      { label: 'DMCA Bildirimi', to: DMCA_PATH },
      { label: 'Yaptirim Politikasi', to: ENFORCEMENT_POLICY_PATH },
      { label: 'Kurallar ve Politikalar Merkezi', to: POLICY_HUB_PATH },
    ],
  },
]
