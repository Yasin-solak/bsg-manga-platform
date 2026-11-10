import {
  COMMUNITY_RULES_PATH,
  DMCA_PATH,
  ENFORCEMENT_POLICY_PATH,
  FANSUB_RULES_PATH,
  KVKK_PATH,
  POLICY_HUB_PATH,
  PRIVACY_PATH,
  STORE_RULES_PATH,
  TERMS_PATH,
} from '@/lib/policyRoutes'
import type { PolicyDocumentDefinition } from './documentTypes'

export const LEGAL_DOCUMENTS: PolicyDocumentDefinition[] = [
  {
    key: 'terms',
    title: 'Kullanim Sartlari',
    eyebrow: 'Yasal',
    summary:
      'Platformun kullanimi, hesap guvenligi, kullanici icerigi, fansub faaliyetleri, magaza ekonomisi ve hizmetin degistirilmesi bu metinle yonetilir.',
    effectiveDate: '17 Mart 2026',
    updatedDate: '17 Mart 2026',
    audience: 'Tum kullanicilar, fansub yoneticileri ve platformu ziyaret eden misafirler.',
    relatedLinks: [
      { label: 'Gizlilik Politikasi', to: PRIVACY_PATH },
      { label: 'Topluluk Kurallari', to: COMMUNITY_RULES_PATH },
      { label: 'Magaza ve Coin Kurallari', to: STORE_RULES_PATH },
      { label: 'Kurallar ve Politikalar Merkezi', to: POLICY_HUB_PATH },
    ],
    sections: [
      {
        id: 'hesap-ve-erisim',
        title: 'Hesap ve erisim',
        paragraphs: [
          'Platforma kayit olan kullanici, hesap bilgilerinin dogrulugundan ve hesabinin guvenliginden sorumludur.',
          'Hesap devri, sahte hesap acma, baskasinin hesabina yetkisiz erisim ve coklu hesapla manipulasyon yasaktir.',
        ],
      },
      {
        id: 'hizmet-kapsami',
        title: 'Hizmet kapsami',
        paragraphs: [
          'Platform manga, webtoon, fansub, topluluk ve dijital magaza deneyimlerini bir arada sunar.',
          'Sunulan ozellikler herhangi bir zamanda guncellenebilir, sinirlanabilir veya teknik ve operasyonel sebeplerle gecici olarak durdurulabilir.',
        ],
      },
      {
        id: 'kullanici-icerigi',
        title: 'Kullanici icerigi ve lisans',
        bullets: [
          'Kullanici, olusturdugu paylasim, yorum ve profil iceriginden bizzat sorumludur.',
          'Platform, hizmeti sunmak, duzenlemek, moderasyon yapmak ve arayuzlerde gostermek icin gerekli sinirli kullanim haklarini sakli tutar.',
          'Hukuka, telife, markaya veya baskalarinin haklarina aykiri icerik kaldirilabilir.',
        ],
      },
      {
        id: 'fansub-ve-magaza',
        title: 'Fansub ve magaza alanlari',
        paragraphs: [
          'Fansub yapilari, ekip adina islem yaparken ek sorumluluk tasir; ekip varliklari ve ekip adina kullanilan yetkiler kurallara tabidir.',
          'Magaza urunleri ve coin akislari dijital hizmet kapsamina dahildir; ayrintilar ilgili politika sayfalarinda yer alir.',
        ],
      },
      {
        id: 'fesih-ve-sorumluluk',
        title: 'Fesih, kisitlama ve sorumluluk siniri',
        bullets: [
          'Kural ihlali, guvenlik riski veya kotuye kullanim halinde hesap ve ozellikler kisitlanabilir.',
          'Hizmetin kesintisiz, hatasiz veya her kosulda erisilebilir olacagi garanti edilmez.',
          'Platform, zorunlu hukuki haller disinda dolayli zararlar icin sorumluluk ustlenmez.',
        ],
      },
    ],
  },
  {
    key: 'privacy',
    title: 'Gizlilik Politikasi',
    eyebrow: 'Yasal',
    summary:
      'Toplanan veriler, isleme amaclari, profil gorunurlugu, guvenlik kayitlari ve kullanici tercihleri bu politika ile aciklanir.',
    effectiveDate: '29 Temmuz 2026',
    updatedDate: '29 Temmuz 2026',
    audience: 'Platformu kullanan veya ziyaret eden tüm kişiler.',
    relatedLinks: [
      { label: 'KVKK Aydinlatma Metni', to: KVKK_PATH },
      { label: 'Kullanim Sartlari', to: TERMS_PATH },
      { label: 'Iletisim ve Hata Bildir', to: '/iletisim' },
    ],
    sections: [
      {
        id: 'veri-sorumlusu',
        title: 'Veri sorumlusu ve iletişim',
        paragraphs: [
          'Bu platformun işletmecisi ve veri sorumlusu BSG Manga\'dır.',
          'Gizlilik ve veri koruma ile ilgili tüm sorular, talepler ve başvurular contact@example.com adresine iletilebilir. Başvurular en geç 30 gün içinde yanıtlanır.',
        ],
      },
      {
        id: 'hangi-veriler',
        title: 'Hangi veriler toplanır',
        bullets: [
          'Hesap ve profil bilgileri (kullanıcı adı, görünen ad, e-posta adresi, avatar ve profil tercihleri)',
          'Topluluk ve yorum içerikleri (gönderiler, yorumlar, tepkiler, okuma listeleri)',
          'Fansub başvuru, ekip üyeliği ve iletişim bilgileri',
          'Mağaza, coin, hediye, bağış ve envanter hareketleri (gerçek para işlemi yapılmaz; tüm bakiye platform içi sanal birimdir)',
          'Okuma etkinliği (okunan bölümler, ilerleme ve okuma tercihleri)',
          'Güvenlik, hata ve destek kayıtları (oturum açma denemeleri, IP tabanlı güvenlik kontrolleri, hata günlükleri)',
        ],
      },
      {
        id: 'neden-islenir',
        title: 'Veriler neden işlenir',
        paragraphs: [
          'Hesap oluşturmak, platform özelliklerini sunmak, coin ve envanter işlemlerini yürütmek, moderasyon yapmak ve destek taleplerini yanıtlamak için veriler işlenir.',
          'Güvenlik, kötüye kullanım önleme ve hizmet kalitesini izleme amaçlarıyla sınırlı loglama yapılır.',
        ],
      },
      {
        id: 'hizmet-saglayicilar',
        title: 'Hizmet sağlayıcılar ve yurt dışı aktarım',
        summary:
          'Platform kendi sunucusunu işletmez; aşağıdaki sağlayıcıların altyapısını kullanır. Bu sağlayıcıların sunucuları yurt dışında bulunduğundan veriler yurt dışına aktarılmış sayılır.',
        bullets: [
          'Supabase — veritabanı, kimlik doğrulama ve hesap e-postaları. Veriler Avrupa Birliği (İrlanda) bölgesinde barındırılır.',
          'Cloudflare Pages — sitenin yayınlanması ve içerik dağıtımı (küresel dağıtım ağı).',
          'Cloudflare R2 — manga kapakları, bölüm sayfaları, avatarlar ve mağaza görsellerinin depolanması.',
          'Cloudflare Web Analytics — ziyaret istatistikleri. Çerez kullanmaz, kişi bazlı takip yapmaz.',
          'Tarayıcı bildirim servisleri (Google, Mozilla, Apple) — yalnızca tarayıcı bildirimlerine izin veren kullanıcılarda, bildirimin cihaza teslimi için.',
        ],
      },
      {
        id: 'cerezler-ve-olcum',
        title: 'Çerezler, tarayıcı depolama ve ölçüm',
        paragraphs: [
          'Platform reklam veya kişi bazlı takip çerezi kullanmaz. Ziyaret ölçümü için kullanılan Cloudflare Web Analytics çerezsiz çalışır.',
          'Hizmetin çalışması için tarayıcınızda şunlar saklanır: oturum bilgisi (sekme kapanınca silinen oturum deposunda), okuyucu tercihleri (görünüm modu, yakınlaştırma, otomatik kaydırma hızı) ve bildirim önerisinin gösterilip gösterilmediği bilgisi.',
          'Bu veriler cihazınızda kalır; tarayıcı ayarlarınızdan temizleyebilirsiniz.',
        ],
      },
      {
        id: 'gorunurluk-ve-tercihler',
        title: 'Görünürlük ve kullanıcı tercihleri',
        paragraphs: [
          'Profil, istatistik, sosyal bağlantı ve aktivite görünürlüğü kullanıcı ayarlarından yönetilebilir.',
          'Buna rağmen zorunlu operasyonel, hukuki veya güvenlik logları kullanıcı tarafından kapatılamaz.',
        ],
      },
      {
        id: 'saklama-sureleri',
        title: 'Saklama süreleri',
        bullets: [
          'Hesap verileri: hesap açık kaldığı sürece saklanır.',
          'Hesap silindiğinde: profil bilgileri silinir; toplulukta bıraktığınız gönderi ve yorumlar, tartışmanın bütünlüğü bozulmasın diye kullanıcı bağlantısı kaldırılarak anonimleştirilir.',
          'Güvenlik ve erişim kayıtları: en fazla 12 ay.',
          'Coin, hediye ve envanter hareket kayıtları: en fazla 12 ay (gerçek para işlemi yapılmadığı için mali mevzuat kaynaklı daha uzun bir saklama yükümlülüğü doğmaz).',
          'Yasal talepler ve telif bildirimleri: sürecin kapanmasından itibaren 12 ay.',
        ],
      },
      {
        id: 'guvenlik',
        title: 'Güvenlik',
        bullets: [
          'Veritabanı erişimi satır düzeyinde yetkilendirme kurallarıyla sınırlandırılır.',
          'Parolalar platform tarafından saklanmaz; kimlik doğrulama sağlayıcısı üzerinden yürütülür.',
          'Makul teknik ve idari güvenlik tedbirleri uygulanır; mutlak güvenlik taahhüdü verilemez.',
          'Güvenlik açığı bildirimleri için /.well-known/security.txt adresindeki iletişim kanalı kullanılabilir.',
        ],
      },
      {
        id: 'haklar-ve-basvuru',
        title: 'Haklar ve başvuru',
        paragraphs: [
          'Verilerinize erişme, düzeltme, silme ve işlemeye itiraz etme haklarınız vardır. Talepler contact@example.com adresine iletilebilir ve en geç 30 gün içinde yanıtlanır.',
          'KVKK kapsamındaki resmi haklar ve başvuru usulü ayrı aydınlatma metninde ayrıntılı olarak yer alır.',
        ],
      },
    ],
  },
  {
    key: 'kvkk',
    title: 'KVKK Aydinlatma Metni',
    eyebrow: 'Yasal',
    summary:
      '6698 sayili KVKK kapsaminda veri kategorileri, isleme sebepleri, aktarim sinirlari ve basvuru usulleri resmi dille aciklanir.',
    effectiveDate: '29 Temmuz 2026',
    updatedDate: '29 Temmuz 2026',
    audience: 'Türkiye merkezli kullanıcılar ve KVKK kapsamında başvuru hakkına sahip kişiler.',
    relatedLinks: [
      { label: 'Gizlilik Politikasi', to: PRIVACY_PATH },
      { label: 'Iletisim ve Hata Bildir', to: '/iletisim' },
    ],
    sections: [
      {
        id: 'veri-sorumlusu',
        title: 'Veri sorumlusu ve iletişim',
        paragraphs: [
          '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu, platformun işletmecisi BSG Manga\'dır.',
          'Başvuru ve iletişim kanalı: contact@example.com',
        ],
      },
      {
        id: 'veri-kategorileri',
        title: 'İşlenen veri kategorileri',
        bullets: [
          'Kimlik ve iletişim verileri: kullanıcı adı, görünen ad, e-posta adresi',
          'Hesap ve oturum bilgileri: oturum kayıtları, cihaz/tarayıcı bilgisi, güvenlik amaçlı IP kaydı',
          'Kullanım ve etkileşim verileri: okuma geçmişi, takip edilen seriler, gönderi ve yorumlar',
          'Finansal olmayan dijital cüzdan ve coin hareket kayıtları (gerçek para işlemi yapılmaz)',
          'Güvenlik ve destek kayıtları: hata günlükleri, moderasyon ve başvuru kayıtları',
        ],
      },
      {
        id: 'hukuki-sebepler',
        title: 'İşleme amaçları ve hukuki sebepler',
        bullets: [
          'Üyelik sözleşmesinin kurulması ve hizmetin sunulması — sözleşmenin ifası için gerekli olması (KVKK m.5/2-c)',
          'Yasal talep, telif bildirimi ve mevzuat kaynaklı kayıtların tutulması — hukuki yükümlülüğün yerine getirilmesi (KVKK m.5/2-ç)',
          'Güvenlik, kötüye kullanım önleme, moderasyon ve hizmet kalitesinin izlenmesi — meşru menfaat (KVKK m.5/2-f)',
          'Tarayıcı bildirimleri ve isteğe bağlı iletişimler — açık rıza (KVKK m.5/1); rıza istendiği anda alınır ve dilediğiniz zaman geri alınabilir',
        ],
      },
      {
        id: 'aktarim-ve-saklama',
        title: 'Aktarım ve saklama',
        summary:
          'Platform kendi sunucusunu işletmez; altyapı hizmet sağlayıcıları kullanılır. Sağlayıcıların sunucuları yurt dışında olduğundan veriler yurt dışına aktarılmaktadır.',
        bullets: [
          'Supabase (Avrupa Birliği — İrlanda): veritabanı, kimlik doğrulama ve hesap e-postaları.',
          'Cloudflare (küresel dağıtım ağı): sitenin yayınlanması, görsel depolama ve çerezsiz ziyaret ölçümü.',
          'Tarayıcı bildirim servisleri (Google, Mozilla, Apple): yalnızca bildirime izin veren kullanıcılarda teslim amacıyla.',
          'Saklama süreleri: hesap açık olduğu sürece hesap verileri; güvenlik ve erişim kayıtları en fazla 12 ay; coin ve envanter hareketleri en fazla 12 ay; yasal talep kayıtları süreç kapandıktan sonra 12 ay.',
          'Hesap silindiğinde profil verileri silinir; topluluk içerikleri kullanıcı bağlantısı kaldırılarak anonimleştirilir.',
        ],
      },
      {
        id: 'ilgili-kisi-haklari',
        title: 'İlgili kişi hakları (KVKK m.11)',
        bullets: [
          'Kişisel verinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme',
          'İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme',
          'Yurt içinde veya yurt dışında verinin aktarıldığı üçüncü kişileri bilme',
          'Eksik veya yanlış işlenmişse düzeltilmesini isteme',
          'Kanunda öngörülen şartlar çerçevesinde silinmesini veya yok edilmesini isteme',
          'Düzeltme, silme ve yok etme işlemlerinin verinin aktarıldığı üçüncü kişilere bildirilmesini isteme',
          'Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç doğmasına itiraz etme',
          'Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme',
        ],
      },
      {
        id: 'basvuru-usulu',
        title: 'Başvuru usulü',
        paragraphs: [
          'KVKK kapsamındaki talepler contact@example.com adresine iletilebilir. Başvurunuz, niteliğine göre en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.',
          'Başvurunun size ait olduğunun doğrulanabilmesi için hesap bilgileriniz üzerinden kimlik teyidi istenebilir; talebin niteliğine göre ek bilgi talep edilebilir.',
          'Telif ve içerik kaldırma talepleri için ayrı bir başvuru merkezi bulunur; bu talepler yasal talepler kuyruğunda ayrıca takip edilir.',
        ],
      },
    ],
  },
  {
    key: 'copyright',
    title: 'Telif ve Icerik Kaldirma',
    eyebrow: 'Yasal',
    summary:
      'Telif, marka, taklit, hak ihlali ve icerik kaldirma talepleri icin basvuru formati, inceleme mantigi ve sonuc akisi bu metinle belirlenir.',
    effectiveDate: '17 Mart 2026',
    updatedDate: '17 Mart 2026',
    audience: 'Hak sahipleri, temsilcileri, fansublar ve kullanicilar.',
    relatedLinks: [
      { label: 'Fansub Kurallari', to: FANSUB_RULES_PATH },
      { label: 'DMCA Bildirimi', to: DMCA_PATH },
      { label: 'Yaptirim Politikasi', to: ENFORCEMENT_POLICY_PATH },
      { label: 'Iletisim ve Hata Bildir', to: '/iletisim' },
    ],
    sections: [
      {
        id: 'hangi-basvurular',
        title: 'Hangi basvurular kabul edilir',
        bullets: [
          'Telif hakki ihlali bildirimleri',
          'Marka ve taklit bildirimleri',
          'Yanlis temsil veya sahte ekip iddialari',
          'Hak sahibi veya yetkili temsilci basvurulari',
        ],
      },
      {
        id: 'gerekli-bilgiler',
        title: 'Bildirim icerigi',
        paragraphs: [
          'Basvuru; hak sahibi bilgisi, yetki dayagi, ilgili icerigin konumu ve talep gerekcesini icermelidir.',
          'Eksik, dogrulanamayan veya kotu niyetli basvurular reddedilebilir.',
        ],
      },
      {
        id: 'inceleme-sonuclari',
        title: 'Inceleme ve sonuc',
        bullets: [
          'Icerik gecici olarak gizlenebilir veya kalici olarak kaldirilabilir.',
          'Ihlale konu hesap, fansub veya topluluk icerigi icin ek inceleme baslatilabilir.',
          'Tekrarlayan ihlaller yaptirim politikasina gore daha agir sonuclara yol acabilir.',
        ],
      },
      {
        id: 'kotu-niyetli-basvuru',
        title: 'Kotu niyetli basvurular',
        paragraphs: [
          'Yaniltici, asilsiz veya baski amacli telif/icerik kaldirma talepleri yaptirim dogurabilir.',
          'Platform, acik kotu niyet halinde ek dogrulama ve erisim kisitlari uygulayabilir.',
        ],
      },
    ],
  },
]
