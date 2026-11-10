export interface FeatureFlagRegistryEntry {
  owner: string
  amac: string
  varsayilan: boolean
  sonKullanmaTarihi: string | null
  cleanupNotu: string
}

export const FEATURE_FLAG_REGISTRY = {
  'home.follow_feed': {
    owner: 'urun-akisi',
    amac: 'Ana sayfada takip feedi yayini kontrol eder.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Feed tum kullanicilara acildiginda kaldirilacak.',
  },
  'home.recommendations': {
    owner: 'urun-akisi',
    amac: 'Ana sayfadaki "Senin icin" rayini ve kisisel oneri kaynagini acar.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Oneri motoru kalici olursa varsayilani acik yap; sezgisel fallback korunur.',
  },
  'reader.comments': {
    owner: 'okuyucu-deneyimi',
    amac: 'Bolum okuyucusunda yorum yuzeyini acar.',
    varsayilan: true,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Yorum sistemi kalici olursa registry kaydi arsive cekilecek.',
  },
  'notifications.center': {
    owner: 'bildirimler',
    amac: 'Bildirim merkezi deneyimini kontrol eder.',
    varsayilan: true,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Eski bildirim girisleri tamamen kalktiginda sadeleştir.',
  },
  'notifications.web_push': {
    owner: 'bildirimler',
    amac: 'Tarayici web push aboneligi (opt-in UI) ve gonderimini acar.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Push kalici olursa varsayilani acik yap; opt-in UI korunur.',
  },
  'economy.coin_codes': {
    owner: 'ekonomi',
    amac: 'Coin kodu kullanma akislarini acar.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Kod kampanyasi kalici olursa dogrudan urunlestir.',
  },
  'economy.fansub_wallet_purchase': {
    owner: 'ekonomi',
    amac: 'Fansub cuzdan satin alma akislarini acar.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Cuzdan satin alma stabil oldugunda kaldirilacak.',
  },
  'economy.fansub_donations': {
    owner: 'ekonomi',
    amac: 'Fansub bagis akislarini kontrol eder.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Bagis akisi default oldugunda flag kaldirilacak.',
  },
  'boost.system': {
    owner: 'fansub-takviye',
    amac: 'Fansub boost planlari, supporter state ve tier capability akislarini acar.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Takviye sistemi genel kullanima acildiginda rollout flagi sadeleştirilecek.',
  },
  'boost.fansub_manage_tab': {
    owner: 'fansub-takviye',
    amac: 'Fansub yonetim panelindeki gecici Takviye sekmesini gorunur tutar.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Gercek site-admin boost merkezi tamamlandiginda bu tarihsel yuzey kaldirilacak.',
  },
  'economy.store_purchase': {
    owner: 'magaza',
    amac: 'Magaza satin alma akislarini kontrol eder.',
    varsayilan: true,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Magaza satin alma kalici oldugunda cleanup backloguna alinacak.',
  },
  'community.enabled': {
    owner: 'topluluk',
    amac: 'Topluluğun genel yayın kapısı. İlk site yayınında kapalıdır. Yalnız açık ve yüzde 100 dağıtımda API, gezinme ve topluluk arka plan işleri açılır; bakım devam eder.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Kalıcı kapatma kontrolü. Açmadan önce tasarım, kapasite ve maliyet kabulü gerekir; kullanıcı sayısıyla otomatik açılmaz.',
  },
  'community.servers_auto_create': {
    owner: 'topluluk',
    amac: 'Fansub sunucusu oluşturma tercihi: açık otomatik, kapalı fansub admini tarafından manuel. Otomatik işlem 5 dakikada bir uygun fansubları kontrol eder.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Kalıcı yönetim tercihi; rollout sonunda kaldırılmaz. Mod değişimi mevcut sunucuları kapatmaz.',
  },
  'moderation.reports': {
    owner: 'moderasyon',
    amac: 'Raporlama yuzeylerini ve aksiyonlarini kontrol eder.',
    varsayilan: true,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Yeni moderasyon merkezi tamamlandiginda tek kapidan yonetilecek.',
  },
  'auth.oauth_google': {
    owner: 'kimlik',
    amac: 'Google ile giris dugmesini acar. Saglayici Supabase tarafinda kurulana kadar KAPALI kalmali; acik ama kurulmamis olursa dugme calismaz.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Google saglayicisi kalici olarak kurulunca bayrak kaldirilabilir.',
  },
  'auth.oauth_discord': {
    owner: 'kimlik',
    amac: 'Discord ile giris dugmesini acar. Apple yerine Discord tercih edildi (topluluk zaten orada).',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Discord saglayicisi kalici olarak kurulunca bayrak kaldirilabilir.',
  },
  'rewards.user_tasks': {
    owner: 'odul-sistemi',
    amac: 'Kullanici gorevleri ve odul akislarini acar.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Gorev sistemi default hale geldiginde registry kaydi kaldirilacak.',
  },
  'rewards.fansub_tasks': {
    owner: 'odul-sistemi',
    amac: 'Fansub gorevleri ve ilerleme akislarini acar.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Fansub gorevleri genel kullanima acildiginda kaldirilacak.',
  },
  'admin.operations_center': {
    owner: 'admin-paneli',
    amac: 'Admin operasyon merkezi rotasini ve yuzeylerini kontrol eder.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Yeni admin navigasyon kalici oldugunda kaldirilacak.',
  },
  'system.maintenance': {
    owner: 'operasyon',
    amac: 'Bakim modu: site ziyaretcilere kapanir, adminler girmeye devam eder.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Kalici bir operasyon anahtari; kaldirilmayacak.',
  },
  'typeset.studio': {
    owner: 'ceviri-studyosu',
    amac: 'Fansub tarafindaki tam ekran Ceviri Studyosunu acar; pilot izin listesiyle BIRLIKTE calisir.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'Pilot basarili olup studyo tum fansublara acildiginda bayrak ve pilot tablosu birlikte kaldirilacak.',
  },
  'translation.studio_v3': {
    owner: 'ceviri-studyosu',
    amac: 'Fansub Ceviri Studyosu V3 (seri -> bolum -> yukle -> tara -> duzenle -> yayinla) akisini acar; site adminleri bayraktan bagimsiz erisir.',
    varsayilan: false,
    sonKullanmaTarihi: null,
    cleanupNotu: 'V3 tum fansublara acilip V2 kaldirildiginda bayrak kaldirilacak.',
  },
} as const satisfies Record<string, FeatureFlagRegistryEntry>

export type FeatureFlagRegistryKey = keyof typeof FEATURE_FLAG_REGISTRY

export function isRegisteredFeatureFlagKey(flagKey: string): flagKey is FeatureFlagRegistryKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAG_REGISTRY, flagKey)
}

export function getFeatureFlagRegistryEntry(flagKey: string) {
  return isRegisteredFeatureFlagKey(flagKey) ? FEATURE_FLAG_REGISTRY[flagKey] : null
}

export function listFeatureFlagRegistryEntries() {
  return Object.entries(FEATURE_FLAG_REGISTRY).map(([key, value]) => ({ key, ...value }))
}
