/**
 * Ready-made preset definitions for user quests.
 *
 * Phase 1 presets:
 * - a curated pack of 21 quests
 * - quests with currently stable metrics
 * - linear dependency defined with unlock_slug
 */

export interface UserQuestPresetRow {
  slug: string
  title: string
  description: string
  metricKey: string
  targetValue: number
  coinReward: number
  sortOrder: number
  tierLevel: number
  taskGroup: string
  unlockSlug: string | null
}

export const USER_QUEST_PHASE1_PRESET: UserQuestPresetRow[] = [
  // 1) Profil vitrini
  {
    slug: 'profile-ready',
    title: 'Vitrini Ac',
    description: 'Profilini tamamla ve kendini tanit.',
    metricKey: 'profile_completed',
    targetValue: 1,
    coinReward: 70,
    sortOrder: 100,
    tierLevel: 1,
    taskGroup: 'profil',
    unlockSlug: null,
  },

  // 2) Kutuphane zinciri
  {
    slug: 'first-follow',
    title: 'Takibe Basla',
    description: 'Ilk mangani takip et.',
    metricKey: 'manga_follow_count',
    targetValue: 1,
    coinReward: 50,
    sortOrder: 110,
    tierLevel: 1,
    taskGroup: 'kutuphane',
    unlockSlug: null,
  },
  {
    slug: 'follow-5',
    title: 'Rafimi Dolduruyorum',
    description: 'Toplam 5 manga takip et.',
    metricKey: 'manga_follow_count',
    targetValue: 5,
    coinReward: 110,
    sortOrder: 120,
    tierLevel: 2,
    taskGroup: 'kutuphane',
    unlockSlug: 'first-follow',
  },
  {
    slug: 'favorites-25',
    title: 'Favori Koleksiyonu',
    description: '25 mangayi favorilere ekle.',
    metricKey: 'favorites_count',
    targetValue: 25,
    coinReward: 240,
    sortOrder: 130,
    tierLevel: 3,
    taskGroup: 'kutuphane',
    unlockSlug: 'follow-5',
  },

  // 3) Fansub zinciri
  {
    slug: 'first-fansub-follow',
    title: 'Ekip Secimi',
    description: 'Ilk fansubunu takip et.',
    metricKey: 'fansub_follow_count',
    targetValue: 1,
    coinReward: 60,
    sortOrder: 140,
    tierLevel: 1,
    taskGroup: 'fansub',
    unlockSlug: null,
  },

  // 4) Degerlendirme zinciri
  {
    slug: 'first-rating',
    title: 'Ilk Puanim',
    description: 'Ilk nitelikli puanini ver.',
    metricKey: 'qualified_ratings',
    targetValue: 1,
    coinReward: 60,
    sortOrder: 150,
    tierLevel: 1,
    taskGroup: 'degerlendirme',
    unlockSlug: null,
  },
  {
    slug: 'rate-10',
    title: 'Elestirmen Baslangici',
    description: 'Toplam 10 nitelikli puan ver.',
    metricKey: 'qualified_ratings',
    targetValue: 10,
    coinReward: 200,
    sortOrder: 160,
    tierLevel: 2,
    taskGroup: 'degerlendirme',
    unlockSlug: 'first-rating',
  },

  // 5) Liste zinciri
  {
    slug: 'first-list',
    title: 'Ilk Liste',
    description: 'Iceriginde manga olan ilk listeni olustur.',
    metricKey: 'lists_with_items',
    targetValue: 1,
    coinReward: 70,
    sortOrder: 170,
    tierLevel: 1,
    taskGroup: 'liste',
    unlockSlug: null,
  },
  {
    slug: 'list-3',
    title: 'Liste Kurucusu',
    description: 'Iceriginde manga olan 3 listeye ulas.',
    metricKey: 'lists_with_items',
    targetValue: 3,
    coinReward: 200,
    sortOrder: 180,
    tierLevel: 2,
    taskGroup: 'liste',
    unlockSlug: 'first-list',
  },
  {
    slug: 'list-curator',
    title: 'Liste Ustasi',
    description: '3 nitelikli liste (10+ manga) olustur.',
    metricKey: 'qualified_lists',
    targetValue: 3,
    coinReward: 360,
    sortOrder: 190,
    tierLevel: 3,
    taskGroup: 'liste',
    unlockSlug: 'list-3',
  },

  // 6) Okuma rotasi zinciri
  {
    slug: 'read-3-manga',
    title: 'Ilk Adim',
    description: '3 farkli manga oku.',
    metricKey: 'unique_mangas_read',
    targetValue: 3,
    coinReward: 60,
    sortOrder: 200,
    tierLevel: 1,
    taskGroup: 'okuma_yolu',
    unlockSlug: null,
  },
  {
    slug: 'read-10-manga',
    title: 'Kesif Basladi',
    description: '10 farkli manga oku.',
    metricKey: 'unique_mangas_read',
    targetValue: 10,
    coinReward: 140,
    sortOrder: 210,
    tierLevel: 2,
    taskGroup: 'okuma_yolu',
    unlockSlug: 'read-3-manga',
  },
  {
    slug: 'read-25-manga',
    title: 'Kitap Kurdu',
    description: '25 farkli manga oku.',
    metricKey: 'unique_mangas_read',
    targetValue: 25,
    coinReward: 320,
    sortOrder: 220,
    tierLevel: 3,
    taskGroup: 'okuma_yolu',
    unlockSlug: 'read-10-manga',
  },

  // 7) Okuma hacmi zinciri
  {
    slug: 'chapters-20',
    title: 'Bolum Avcisi',
    description: 'Toplam 20 bolum oku.',
    metricKey: 'chapters_read',
    targetValue: 20,
    coinReward: 120,
    sortOrder: 230,
    tierLevel: 1,
    taskGroup: 'okuma_hacmi',
    unlockSlug: null,
  },
  {
    slug: 'chapters-75',
    title: 'Hacim Kazandi',
    description: 'Toplam 75 bolum oku.',
    metricKey: 'chapters_read',
    targetValue: 75,
    coinReward: 280,
    sortOrder: 240,
    tierLevel: 2,
    taskGroup: 'okuma_hacmi',
    unlockSlug: 'chapters-20',
  },

  // 8) Kesif zinciri
  {
    slug: 'genre-3',
    title: 'Uc Tur Denedim',
    description: '3 farkli turde manga oku.',
    metricKey: 'genres_explored',
    targetValue: 3,
    coinReward: 100,
    sortOrder: 250,
    tierLevel: 1,
    taskGroup: 'kesif',
    unlockSlug: null,
  },
  {
    slug: 'genre-6',
    title: 'Tur Kasifi',
    description: '6 farkli turde manga oku.',
    metricKey: 'genres_explored',
    targetValue: 6,
    coinReward: 220,
    sortOrder: 260,
    tierLevel: 2,
    taskGroup: 'kesif',
    unlockSlug: 'genre-3',
  },

  // 9) Sadakat zinciri
  {
    slug: 'streak-2',
    title: 'Ertesi Gun Geri Don',
    description: '2 gun ust uste aktif ol.',
    metricKey: 'consecutive_days',
    targetValue: 2,
    coinReward: 90,
    sortOrder: 270,
    tierLevel: 1,
    taskGroup: 'sadakat',
    unlockSlug: null,
  },
  {
    slug: 'streak-4',
    title: 'Mini Seri',
    description: '4 gun ust uste aktif ol.',
    metricKey: 'consecutive_days',
    targetValue: 4,
    coinReward: 140,
    sortOrder: 280,
    tierLevel: 2,
    taskGroup: 'sadakat',
    unlockSlug: 'streak-2',
  },
  {
    slug: 'streak-7',
    title: 'Haftalik Sadakat',
    description: '7 gun ust uste aktif ol.',
    metricKey: 'consecutive_days',
    targetValue: 7,
    coinReward: 220,
    sortOrder: 290,
    tierLevel: 3,
    taskGroup: 'sadakat',
    unlockSlug: 'streak-4',
  },

  // 10) Topluluk katkisi zinciri
  {
    slug: 'comment-5-unique',
    title: 'Sesi Duyuldu',
    description: '5 farkli mangaya nitelikli yorum yap.',
    metricKey: 'qualified_unique_comments',
    targetValue: 5,
    coinReward: 160,
    sortOrder: 300,
    tierLevel: 1,
    taskGroup: 'topluluk',
    unlockSlug: null,
  },
]

export const USER_QUEST_PHASE1_PRESET_NAME = 'Kullanici Faz 1 Preseti (21 gorev)'
