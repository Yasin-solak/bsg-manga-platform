import {
  COMMUNITY_RULES_PATH,
  COPYRIGHT_POLICY_PATH,
  ENFORCEMENT_POLICY_PATH,
  FANSUB_RULES_PATH,
  POLICY_HUB_PATH,
  REFUND_POLICY_PATH,
  STORE_RULES_PATH,
  TERMS_PATH,
} from '@/lib/policyRoutes'
import type { PolicyDocumentDefinition } from './documentTypes'

export const RULE_DOCUMENTS: PolicyDocumentDefinition[] = [
  {
    key: 'community-rules',
    title: 'Topluluk Kurallari',
    eyebrow: 'Kurallar',
    summary:
      'Topluluk paylasimlari, yorumlar ve etkileşimlerde kabul edilmeyen davranislar ile moderasyonun temel mudahale yetkileri bu metinde yer alir.',
    effectiveDate: '17 Mart 2026',
    updatedDate: '17 Mart 2026',
    audience: 'Toplulukta paylasim yapan veya yorum birakan tum kullanicilar.',
    relatedLinks: [
      { label: 'Yaptirim Politikasi', to: ENFORCEMENT_POLICY_PATH },
      { label: 'Kullanim Sartlari', to: TERMS_PATH },
    ],
    sections: [
      {
        id: 'yasak-icerikler',
        title: 'Yasak icerikler',
        bullets: [
          'Taciz, tehdit, nefret soylemi, doxxing ve hedef gosterme',
          'Spam, flood, sahte etkileşim veya sistem manipulasyonu',
          'Yaniltici, dolandirici veya kotu niyetli dis baglantilar',
          'Toplulugu zedeleyen spoiler istismari ve tekrarli provokasyon',
        ],
      },
      {
        id: 'icerik-kalitesi',
        title: 'Icerik kalitesi ve baglam',
        paragraphs: [
          'Paylasimlar makul baglam, okunabilirlik ve dogru temsil sorumlulugu ile olusturulmalidir.',
          'Moderasyon, duzen bozucu veya acik manipule edilmis icerigi one cikarmamak, gizlemek veya kaldirmak hakkina sahiptir.',
        ],
      },
      {
        id: 'yorum-ve-etkilesim',
        title: 'Yorum ve etkileşim kurallari',
        bullets: [
          'Tartisma konusu disina tasan hedefli kavgalar kabul edilmez.',
          'Yorum zincirlerinde suistimal, tahrik veya toplu baski yasaktir.',
          'Emoji, reaction ve benzeri sinyaller taciz araci olarak kullanilamaz.',
        ],
      },
      {
        id: 'moderasyon',
        title: 'Moderasyon hakki',
        paragraphs: [
          'Platform, gerekli hallerde icerigi kaldirabilir, gorunurlugu kisitlayabilir veya hesap uzerinde gecici islem uygulayabilir.',
          'Tekrarlayan veya agir ihlaller yaptirim politikasina gore daha ileri sonuclara tasinir.',
        ],
      },
    ],
  },
  {
    key: 'fansub-rules',
    title: 'Fansub Kurallari',
    eyebrow: 'Kurallar',
    summary:
      'Fansub ekipleri, ekip yoneticileri ve ekip adina hareket eden uyelerin temsili, cüzdan kullanimi ve guven iliskisi bu kurallarla sinirlanir.',
    effectiveDate: '17 Mart 2026',
    updatedDate: '17 Mart 2026',
    audience: 'Fansub yoneticileri, moderatorleri, ekip uyeleri ve basvuru sahipleri.',
    relatedLinks: [
      { label: 'Telif ve Icerik Kaldirma', to: COPYRIGHT_POLICY_PATH },
      { label: 'Yaptirim Politikasi', to: ENFORCEMENT_POLICY_PATH },
      { label: 'Magaza ve Coin Kurallari', to: STORE_RULES_PATH },
    ],
    sections: [
      {
        id: 'temsil-sorumlulugu',
        title: 'Temsil sorumlulugu',
        paragraphs: [
          'Fansub adi, logosu, aciklamasi ve kamuya acik iletisim alanlari gercegi yansitmalidir.',
          'Sahte ekip, taklit ekip, marka suistimali ve baska ekibi taklit eden kimlikler yasaktir.',
        ],
      },
      {
        id: 'uye-ve-yetki',
        title: 'Uye ve yetki yonetimi',
        bullets: [
          'Yetki kotuye kullanimi, ekip varliklarini kendi lehine cevirme ve ekip adina yetkisiz islem yasaktir.',
          'Basvuru, davet ve ekip uyeligi surecleri kayit altinda tutulabilir.',
          'Ekip adina yapilan islemden ilgili yetkili uyeler sorumlu tutulabilir.',
        ],
      },
      {
        id: 'cuzdan-ve-envanter',
        title: 'Fansub cüzdani ve envanter',
        paragraphs: [
          'Fansub kasasi, coin, bagis, hediye ve store varliklari ekip amaclari disinda kullanilamaz.',
          'Fraud, exploit, kendine avantaj saglayan sahte islem zinciri veya cüzdan manipülasyonu agir ihlal sayilir.',
        ],
      },
      {
        id: 'icerik-ve-haklar',
        title: 'Icerik ve hak sahipligi',
        bullets: [
          'Zararli link, acik hak ihlali, kotu niyetli dagitim ve telif bildirimini yok sayan yayin politikasi yasaktir.',
          'Hak sahibi talebi geldiginde ekipten aciklama, kayit ve is birligi beklenebilir.',
        ],
      },
      {
        id: 'sonuclar',
        title: 'Ihlal sonuclari',
        paragraphs: [
          'Agir ihlallerde ekip yetkileri dondurulabilir, ekip cüzdani kisitlanabilir veya ekip gorunurlugu kapatilabilir.',
          'Gerektiginde bireysel uye ve ekip seviyesinde farkli yaptirimlar birlikte uygulanabilir.',
        ],
      },
    ],
  },
  {
    key: 'store-rules',
    title: 'Magaza ve Coin Kurallari',
    eyebrow: 'Kurallar',
    summary:
      'Coin ekonomisi, dijital urunlerin lisans niteliği, hediye ve fansub kasasi kullanimlari ile kotuye kullanim engelleri bu metinle duzenlenir.',
    effectiveDate: '17 Mart 2026',
    updatedDate: '17 Mart 2026',
    audience: 'Magaza kullanan tum kullanicilar ve fansub cüzdani kullanan ekipler.',
    relatedLinks: [
      { label: 'Iade / Iptal / Dijital Teslim', to: REFUND_POLICY_PATH },
      { label: 'Yaptirim Politikasi', to: ENFORCEMENT_POLICY_PATH },
      { label: 'Kullanim Sartlari', to: TERMS_PATH },
    ],
    sections: [
      {
        id: 'dijital-lisans',
        title: 'Dijital lisans niteliği',
        paragraphs: [
          'Coin, dijital urun ve envanter kalemleri fiziksel urun degildir; platform icinde kullanilan sınırlı dijital haklardir.',
          'Mülkiyet devri, yatirim araci, devredilebilir para benzeri hak veya harici ekonomi vaadi dogurmaz.',
        ],
      },
      {
        id: 'fiyat-ve-erisilebilirlik',
        title: 'Fiyat, kampanya ve uygunluk',
        bullets: [
          'Fiyatlar ve kampanyalar onceden haber verilmeksizin guncellenebilir.',
          'Belirli urunler kullanici, fansub veya hediye akislari icin ayri kosullar tasiyabilir.',
          'Ozellik veya urun erisimi feature flag, stok mantigi veya teknik kisit nedeniyle degisebilir.',
        ],
      },
      {
        id: 'yasakli-ekonomi-davranisleri',
        title: 'Yasakli ekonomi davranislari',
        bullets: [
          'Coin kodu suistimali',
          'Coklu hesapla bakiyeyi manipule etme',
          'Hediye veya bagis akisini exploit etme',
          'Sistem hatasiyla kazanc saglama ve bunu bildirmeme',
        ],
      },
      {
        id: 'geri-alim-ve-duzeltme',
        title: 'Geri alim ve duzeltme hakki',
        paragraphs: [
          'Sistem hatasi, fraud veya yetkisiz islem saptanirsa coin, envanter veya ilgili store haklari geri alinabilir.',
          'Gerekirse ilgili hesap veya fansub cüzdani gecici olarak kisitlanabilir.',
        ],
      },
    ],
  },
  {
    key: 'refund',
    title: 'Iade / Iptal / Dijital Teslim Politikasi',
    eyebrow: 'Kurallar',
    summary:
      'Dijital teslim niteligindeki coin ve store urunlerinde genel kural nihai satistir; teknik ariza, fraud ve mevzuat istisnalari ayri incelenir.',
    effectiveDate: '17 Mart 2026',
    updatedDate: '17 Mart 2026',
    audience: 'Coin, store urunu, hediye veya dijital teslim kullanan herkes.',
    relatedLinks: [
      { label: 'Magaza ve Coin Kurallari', to: STORE_RULES_PATH },
      { label: 'Iletisim ve Hata Bildir', to: '/iletisim' },
    ],
    sections: [
      {
        id: 'genel-kural',
        title: 'Genel kural',
        paragraphs: [
          'Dijital olarak teslim edilen coin ve store urunleri kural olarak nihai satistir.',
          'Kullanici, satin alma oncesinde urun, fiyat, hedef ve ödeme kaynagini kontrol etmekle sorumludur.',
        ],
      },
      {
        id: 'iade-inceleme-durumlari',
        title: 'Incelemeli iade veya geri yukleme halleri',
        bullets: [
          'Teslim basarisiz ise',
          'Cift islem veya duplicate teslim olusmussa',
          'Yetkisiz kullanim veya fraud supheleri varsa',
          'Sistem hatasi nedeniyle yanlis tahsilat veya tanimlama yapilmissa',
          'Zorunlu mevzuat sebebiyle iade gerekiyorsa',
        ],
      },
      {
        id: 'hediye-ve-fansub',
        title: 'Hediye ve fansub hedefli islem kurali',
        paragraphs: [
          'Basariyla teslim edilmis hediye urunler ve fansub envanterine gecmis dijital varliklar kural olarak geri alinmaz.',
          'Fraud, exploit veya hesap guvenligi kaynakli istisnalar ayridir.',
        ],
      },
      {
        id: 'ters-ibraz-ve-kotuye-kullanim',
        title: 'Ters ibraz ve kotuye kullanim',
        paragraphs: [
          'Mevcut sistem dogrudan kartli odeme agirlikli olmasa da, ileride acilacak odeme kanallarinda ters ibraz ve odeme kotuye kullanimlari ayrica yaptirim sebebi sayilir.',
          'Coin ve dijital teslim suistimalleri yalniz iade degil, ozellik kisiti ve hesap aksiyonlari da dogurabilir.',
        ],
      },
    ],
  },
  {
    key: 'enforcement',
    title: 'Yaptirim Politikasi',
    eyebrow: 'Kurallar',
    summary:
      'Ihlalin agirligi, tekrar orani, guvenlik riski ve verilen zarara gore uygulanan kademeli yaptirim mantigi bu sayfada ozetlenir.',
    effectiveDate: '17 Mart 2026',
    updatedDate: '17 Mart 2026',
    audience: 'Tum kullanicilar, fansub ekipleri ve platformu etkileyen eylemlerde bulunan kisiler.',
    relatedLinks: [
      { label: 'Topluluk Kurallari', to: COMMUNITY_RULES_PATH },
      { label: 'Fansub Kurallari', to: FANSUB_RULES_PATH },
      { label: 'Kurallar ve Politikalar Merkezi', to: POLICY_HUB_PATH },
    ],
    sections: [
      {
        id: 'esaslar',
        title: 'Yaptirim esaslari',
        paragraphs: [
          'Platform, her ihlali tek bir sabit ceza tablosuyla degil; baglam, tekrar, zarar ve guvenlik riskine gore degerlendirir.',
          'Bu sayfa kamuya acik genel seviyeyi anlatir; tam operasyonel karar matrisi ic operasyon rehberi olarak sakli tutulur.',
        ],
      },
      {
        id: 'olasi-sonuclar',
        title: 'Uygulanabilecek sonuclar',
        bullets: [
          'Uyari veya resmi bildirim',
          'Icerik kaldirma veya gorunurluk kisiti',
          'Ozellik kisiti veya gecici posting kitlemesi',
          'Gecici hesap askisi',
          'Store, coin veya fansub yetkisi kisiti',
          'Kalici hesap veya ekip yasagi',
        ],
      },
      {
        id: 'agirlestirici-haller',
        title: 'Agirlastirici haller',
        bullets: [
          'Tekrarlayan ihlal',
          'Coklu hesap kullanimi',
          'Guvenlik veya fraud riski',
          'Hak sahibi veya kullaniciya olcumlenebilir zarar',
          'Moderasyonu kandirmaya yonelik davranis',
        ],
      },
      {
        id: 'itiraz-ve-tekrar',
        title: 'Itiraz ve tekrar degerlendirme',
        paragraphs: [
          'Belirli aksiyonlarda yeniden inceleme talebi destek kanallari uzerinden alinabilir.',
          'Yeniden inceleme talebi, aksiyonun otomatik olarak kaldirilacagi anlamina gelmez.',
        ],
      },
    ],
  },
]
