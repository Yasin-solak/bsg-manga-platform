import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const BACKUP_DIR = 'backups'
const MANGA_ID_PREFIX = '70000000-0000-0000-0000-'
const CHAPTER_ID_PREFIX = '71000000-0000-0000-0000-'
const COMMENT_ID_PREFIX = '72000000-0000-0000-0000-'
const COMMENT_BATCH_SIZE = 200
const DELETE_BATCH_SIZE = 200
const FETCH_BATCH_SIZE = 500

const TURKISH_CHAR_MAP = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
}

const SAMPLE_SERIES = [
  {
    title: 'Şafak Avcısı',
    coverPath: '/covers/optimized/shadow-warrior.webp',
    description: 'Kıyamet sonrası İstanbul sokaklarında iz süren genç bir avcının, kayıp hafızasını ve şehrin altındaki eski düzeni keşfetme hikayesi.',
    genres: ['Aksiyon', 'Gizem', 'Doğaüstü'],
    author: 'Sample Author',
    artist: 'MZ Atelier',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-01-12',
  },
  {
    title: 'Gölgelerin Mührü',
    coverPath: '/covers/optimized/dragon-court.webp',
    description: 'Saray entrikaları, yasak büyü ve parçalanan ittifaklar arasında ayakta kalmaya çalışan bir muhafızın hikayesi.',
    genres: ['Fantastik', 'Drama', 'Tarihi'],
    author: 'Mina Aral',
    artist: 'K. Ece',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-01-18',
  },
  {
    title: 'Kayıp Akademi',
    coverPath: '/covers/optimized/starlight-academy.webp',
    description: 'Bir gün haritadan silinen okulun öğrencileri, kapalı kampüsün içinde kendi gerçeklikleriyle yüzleşmek zorunda kalır.',
    genres: ['Okul', 'Gizem', 'Psikolojik'],
    author: 'S. Deniz',
    artist: 'Cloud Ink',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-01-23',
  },
  {
    title: 'Çelik Rüzgar',
    coverPath: '/covers/optimized/wind-chronicle.webp',
    description: 'Gökyüzü adalarında geçen bu seride, hurda gemilerden dev bir filo kurmaya çalışan asi bir tamirciyi izliyoruz.',
    genres: ['Bilim Kurgu', 'Macera', 'Aksiyon'],
    author: 'Bora Erdem',
    artist: 'Rift Works',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-01-30',
  },
  {
    title: 'Kızıl Eşik',
    coverPath: '/covers/optimized/deep-abyss.webp',
    description: 'Sırlar taşıyan bir apartmanda, her kapının ardında başka bir zaman çizgisine açılan çatlaklar beliriyor.',
    genres: ['Gerilim', 'Korku', 'Gizem'],
    author: 'Lale Koru',
    artist: 'Night Panel',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-02-04',
  },
  {
    title: 'Mavi Gece Güncesi',
    coverPath: '/covers/optimized/phantom-guild.webp',
    description: 'Gündüzleri sıradan, geceleri ise şehrin rüyalarını kaydeden bir kuryenin sakin ama çarpıcı yolculuğu.',
    genres: ['Dram', 'Slice of Life', 'Doğaüstü'],
    author: 'Ela Varlık',
    artist: 'Bulut Panel',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-02-11',
  },
  {
    title: 'Sonsuz Bahçe',
    coverPath: '/covers/optimized/cursed-sword.webp',
    description: 'Her mevsimde değişen bir bahçenin kalbinde, ölümsüz bir bekçi ve kaybolan ziyaretçilerin hikayeleri örülüyor.',
    genres: ['Fantastik', 'Romantizm', 'Dram'],
    author: 'Naz Köse',
    artist: 'Petal Frame',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-02-18',
  },
  {
    title: 'Yıldızların Ardında',
    coverPath: '/covers/optimized/iron-blood.webp',
    description: 'Derin uzay madenciliği yapan bir ekip, sessiz bir enkazın içinde bütün insanlığı ilgilendiren bir mesaj bulur.',
    genres: ['Bilim Kurgu', 'Aksiyon', 'Gizem'],
    author: 'Arda Kaan',
    artist: 'Nova Draft',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-02-25',
  },
  {
    title: 'Kırık Taç',
    coverPath: '/covers/optimized/dragon-court.webp',
    description: 'Tahttan indirilen bir veliahtın, parçalanmış krallığı yeniden kurmak için eski düşmanlarıyla zoraki ittifakı.',
    genres: ['Fantastik', 'Aksiyon', 'Politik'],
    author: 'Ekin Ates',
    artist: 'Crown Lab',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-03-03',
  },
  {
    title: 'Son Büyücü',
    coverPath: '/covers/optimized/cursed-sword.webp',
    description: 'Büyünün yasaklandığı bir çağda, son büyücü olduğu söylenen bir gencin peşine hem krallık hem yeraltı düşer.',
    genres: ['Fantastik', 'Macera', 'Shounen'],
    author: 'Baris Ipek',
    artist: 'MZ Atelier',
    status: 'ongoing',
    originalLang: 'tr',
    releaseDate: '2026-03-10',
  },
]

const CHAPTER_TITLES = [
  'İlk Kıvılcım',
  'Derinleşen İzler',
  'Eşiğin Ötesi',
]

function toUuid(prefix, index) {
  return `${prefix}${String(index).padStart(12, '0')}`
}

function chunk(items, size) {
  const output = []
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size))
  }
  return output
}

function uniqueBy(items, getKey) {
  const seen = new Map()
  for (const item of items) {
    seen.set(getKey(item), item)
  }
  return [...seen.values()]
}

function slugifyText(value) {
  return value
    .split('')
    .map((char) => TURKISH_CHAR_MAP[char] || char)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function fail(message) {
  throw new Error(message)
}

function logStep(message) {
  console.log(`\n== ${message} ==`)
}

async function fetchAllRows(queryFactory) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + FETCH_BATCH_SIZE - 1
    const { data, error } = await queryFactory().range(from, to)
    if (error) throw error

    const batch = data || []
    rows.push(...batch)
    if (batch.length < FETCH_BATCH_SIZE) break
    from += FETCH_BATCH_SIZE
  }

  return rows
}

async function fetchRowsByIds(client, tableName, columnName, ids, options = {}) {
  const rows = []
  const selectClause = options.select || '*'
  const applyQuery = typeof options.applyQuery === 'function'
    ? options.applyQuery
    : (query) => query

  for (const group of chunk(ids, DELETE_BATCH_SIZE)) {
    if (group.length === 0) continue

    const { data, error } = await applyQuery(client
      .from(tableName)
      .select(selectClause)
      .in(columnName, group))

    if (error) throw error
    rows.push(...(data || []))
  }

  return rows
}

function extractMissingColumn(error) {
  const message = String(error?.message || '')
  const postgrestMatch = message.match(/Could not find the '([^']+)' column/i)
  if (postgrestMatch?.[1]) {
    return postgrestMatch[1]
  }

  const postgresMatch = message.match(/column "?([a-zA-Z0-9_]+)"? of relation/i)
  if (postgresMatch?.[1]) {
    return postgresMatch[1]
  }

  return null
}

function stripColumns(rows, columnName) {
  return rows.map((row) => {
    const nextRow = { ...row }
    delete nextRow[columnName]
    return nextRow
  })
}

async function insertRowsWithOptionalColumns(client, tableName, rows, optionalColumns = []) {
  if (rows.length === 0) return

  let workingRows = rows.map((row) => ({ ...row }))
  const remainingOptional = new Set(optionalColumns)

  while (true) {
    const { error } = await client
      .from(tableName)
      .insert(workingRows)

    if (!error) {
      return
    }

    const missingColumn = extractMissingColumn(error)
    if (!missingColumn || !remainingOptional.has(missingColumn)) {
      throw error
    }

    console.warn(`[seed] ${tableName} tablosunda ${missingColumn} kolonu yok, fallback insert uygulanacak.`)
    remainingOptional.delete(missingColumn)
    workingRows = stripColumns(workingRows, missingColumn)
  }
}

async function deleteWhereIds(client, tableName, columnName, ids) {
  for (const group of chunk(ids, DELETE_BATCH_SIZE)) {
    if (group.length === 0) continue
    const { error } = await client
      .from(tableName)
      .delete()
      .in(columnName, group)

    if (error) throw error
  }
}

function buildCoverUrl(seriesIndex, title, coverPath) {
  if (typeof coverPath === 'string' && coverPath.trim()) {
    return coverPath.trim()
  }

  return `https://placehold.co/720x1024/101826/F8FAFC?text=${encodeURIComponent(`${seriesIndex + 1}. ${title}`)}`
}

function buildPageUrls(seriesIndex, chapterNumber) {
  return Array.from({ length: 4 }, (_, pageIndex) => (
    `https://placehold.co/1200x1800/111827/F8FAFC?text=${encodeURIComponent(`M${seriesIndex + 1}-B${chapterNumber}-S${pageIndex + 1}`)}`
  ))
}

function buildMangaCommentBody({ title, username, chapterNumber, spoiler = false }) {
  if (chapterNumber == null) {
    return `${title} acilisi gayet temiz duruyor. ${username} olarak atmosferi ve karakter tanitimini beğendim.`
  }

  if (spoiler) {
    return `${title} ${chapterNumber}. bolumdeki son sahne baya iyi baglandi. Devaminda bunun nereye gidecegini merak ettim.`
  }

  return `${title} ${chapterNumber}. bolum ritmi iyi tasiyor. Diyaloglar ve panel akisinda su ana kadar kopus yok.`
}

async function createBackupSnapshot(client, backupPath) {
  logStep('Mevcut manga verisi yedekleniyor')

  const mangas = await fetchAllRows(() => client.from('mangas').select('*').order('created_at', { ascending: true }))
  const mangaIds = mangas.map((row) => row.id)
  const chapters = mangaIds.length > 0
    ? await fetchAllRows(() => client.from('chapters').select('*').in('manga_id', mangaIds).order('created_at', { ascending: true }))
    : []
  const chapterIds = chapters.map((row) => row.id)
  const comments = mangaIds.length > 0
    ? await fetchAllRows(() => client.from('manga_comments').select('*').in('manga_id', mangaIds).order('created_at', { ascending: true }))
    : []
  const commentIds = comments.map((row) => row.id)
  const reports = commentIds.length > 0
    ? await fetchRowsByIds(client, 'reports', 'target_id', commentIds, {
      applyQuery: (query) => query.eq('target_type', 'manga_comment'),
    })
    : []
  const pendingRevisions = mangaIds.length > 0 || chapters.length > 0
    ? await fetchRowsByIds(client, 'pending_content_revisions', 'target_id', [...mangaIds, ...chapterIds])
    : []
  const activityEvents = mangaIds.length > 0 || chapters.length > 0 || commentIds.length > 0
    ? uniqueBy([
      ...(mangaIds.length > 0 ? await fetchRowsByIds(client, 'activity_events', 'manga_id', mangaIds) : []),
      ...(chapterIds.length > 0 ? await fetchRowsByIds(client, 'activity_events', 'chapter_id', chapterIds) : []),
      ...(commentIds.length > 0 ? await fetchRowsByIds(client, 'activity_events', 'comment_id', commentIds) : []),
    ], (row) => row.id)
    : []

  const snapshot = {
    createdAt: new Date().toISOString(),
    counts: {
      mangas: mangas.length,
      chapters: chapters.length,
      comments: comments.length,
      reports: reports.length,
      pendingRevisions: pendingRevisions.length,
      activityEvents: activityEvents.length,
    },
    mangas,
    chapters,
    comments,
    reports,
    pendingRevisions,
    activityEvents,
  }

  fs.mkdirSync(path.dirname(backupPath), { recursive: true })
  fs.writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), 'utf8')

  return { mangas, chapters, comments }
}

async function cleanupExistingCatalog(client, existing) {
  const mangaIds = existing.mangas.map((row) => row.id)
  const chapterIds = existing.chapters.map((row) => row.id)
  const commentIds = existing.comments.map((row) => row.id)

  if (commentIds.length > 0) {
    logStep('Manga yorum raporlari temizleniyor')
    for (const group of chunk(commentIds, DELETE_BATCH_SIZE)) {
      const { error } = await client
        .from('reports')
        .delete()
        .eq('target_type', 'manga_comment')
        .in('target_id', group)

      if (error) throw error
    }
  }

  if (commentIds.length > 0 || chapterIds.length > 0 || mangaIds.length > 0) {
    logStep('Aktivite akisi ve revizyon kayitlari temizleniyor')

    for (const group of chunk(commentIds, DELETE_BATCH_SIZE)) {
      if (group.length === 0) continue
      const { error } = await client
        .from('activity_events')
        .delete()
        .in('comment_id', group)

      if (error) throw error
    }

    for (const group of chunk(chapterIds, DELETE_BATCH_SIZE)) {
      if (group.length === 0) continue
      const { error: activityError } = await client
        .from('activity_events')
        .delete()
        .in('chapter_id', group)

      if (activityError) throw activityError

      const { error: revisionError } = await client
        .from('pending_content_revisions')
        .delete()
        .eq('target_type', 'chapter')
        .in('target_id', group)

      if (revisionError) throw revisionError
    }

    for (const group of chunk(mangaIds, DELETE_BATCH_SIZE)) {
      if (group.length === 0) continue
      const { error: activityError } = await client
        .from('activity_events')
        .delete()
        .in('manga_id', group)

      if (activityError) throw activityError

      const { error: revisionError } = await client
        .from('pending_content_revisions')
        .delete()
        .eq('target_type', 'manga')
        .in('target_id', group)

      if (revisionError) throw revisionError
    }
  }

  if (mangaIds.length > 0) {
    logStep('Mevcut manga ve bolum kayitlari siliniyor')
    await deleteWhereIds(client, 'mangas', 'id', mangaIds)
  }
}

async function ensureDependencies(client) {
  const { data: fansubs, error: fansubError } = await client
    .from('fansubs')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (fansubError) throw fansubError
  if (!fansubs || fansubs.length === 0) {
    fail('Ornek veri icin aktif fansub bulunamadi.')
  }

  const { data: users, error: userError } = await client
    .from('users')
    .select('id, username, role')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (userError) throw userError
  if (!users || users.length < 3) {
    fail('Comment seed needs at least 3 active users.')
  }

  return { fansubs, users }
}

async function seedShowcaseCatalog(client, dependencies) {
  const mangas = SAMPLE_SERIES.map((series, index) => {
    const fansub = dependencies.fansubs[index % dependencies.fansubs.length]
    const chapterCount = 3
    return {
      id: toUuid(MANGA_ID_PREFIX, index + 101),
      fansub_id: fansub.id,
      title: series.title,
      slug: `${slugifyText(series.title)}-${String(index + 1).padStart(2, '0')}`,
      cover_image_url: buildCoverUrl(index, series.title, series.coverPath),
      description: series.description,
      author: series.author,
      artist: series.artist,
      status: series.status,
      total_views: 1200 + (index * 375),
      total_ratings: 24 + (index * 3),
      rating: Number((4.1 + ((index % 4) * 0.17)).toFixed(2)),
      is_new: index >= 7,
      is_approved: true,
      is_active: true,
      last_chapter_number: chapterCount,
      genres: series.genres,
      original_lang: series.originalLang,
      release_date: series.releaseDate,
      created_at: new Date(Date.UTC(2026, 0, 12 + (index * 2), 9, 0, 0)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 3, 21, 9, 0, 0)).toISOString(),
    }
  })

  logStep('Ornek mangalar ekleniyor')
  const { error: mangaInsertError } = await client
    .from('mangas')
    .insert(mangas)

  if (mangaInsertError) throw mangaInsertError

  const chapters = []
  mangas.forEach((manga, mangaIndex) => {
    const fansub = dependencies.fansubs[mangaIndex % dependencies.fansubs.length]
    for (let chapterNumber = 1; chapterNumber <= 3; chapterNumber += 1) {
      const chapterRow = {
        id: toUuid(CHAPTER_ID_PREFIX, (mangaIndex * 10) + chapterNumber),
        manga_id: manga.id,
        fansub_id: fansub.id,
        chapter_number: chapterNumber,
        title: CHAPTER_TITLES[chapterNumber - 1],
        pages: buildPageUrls(mangaIndex, chapterNumber),
        is_approved: true,
        is_active: true,
        publish_at: new Date(Date.UTC(2026, 1, 1 + mangaIndex, 12 + chapterNumber, 0, 0)).toISOString(),
        created_at: new Date(Date.UTC(2026, 1, 1 + mangaIndex, 10 + chapterNumber, 0, 0)).toISOString(),
        updated_at: new Date(Date.UTC(2026, 3, 21, 9, 30, 0)).toISOString(),
      }

      chapters.push(chapterRow)
    }
  })

  logStep('Ornek bolumler ekleniyor')
  await insertRowsWithOptionalColumns(client, 'chapters', chapters, ['publish_at'])

  const comments = []
  let commentIndex = 1

  mangas.forEach((manga, mangaIndex) => {
    const primaryUser = dependencies.users[mangaIndex % dependencies.users.length]
    const secondaryUser = dependencies.users[(mangaIndex + 1) % dependencies.users.length]
    const tertiaryUser = dependencies.users[(mangaIndex + 2) % dependencies.users.length]
    const latestChapter = chapters.find((chapter) => chapter.manga_id === manga.id && Number(chapter.chapter_number) === 3)

    const baseCreatedAt = new Date(Date.UTC(2026, 3, 20, 8 + (mangaIndex % 6), 0, 0))
    const topLevelId = toUuid(COMMENT_ID_PREFIX, commentIndex)
    commentIndex += 1

    const topLevelComment = {
      id: topLevelId,
      manga_id: manga.id,
      chapter_id: null,
      user_id: primaryUser.id,
      parent_id: null,
      content: buildMangaCommentBody({ title: manga.title, username: primaryUser.username }),
      likes: 3 + (mangaIndex % 5),
      dislikes: mangaIndex % 2,
      is_spoiler: false,
      is_pinned: mangaIndex === 0,
      is_active: true,
      created_at: baseCreatedAt.toISOString(),
      updated_at: baseCreatedAt.toISOString(),
    }

    comments.push(topLevelComment)

    const replyCreatedAt = new Date(baseCreatedAt.getTime() + (15 * 60 * 1000))
    const replyComment = {
      id: toUuid(COMMENT_ID_PREFIX, commentIndex),
      manga_id: manga.id,
      chapter_id: null,
      user_id: secondaryUser.id,
      parent_id: topLevelId,
      content: `${manga.title} icin ikinci bolumden sonra tempo daha da aciliyor. Bekledigimden iyi topladi.`,
      likes: 1 + (mangaIndex % 3),
      dislikes: 0,
      is_spoiler: false,
      is_pinned: false,
      is_active: true,
      created_at: replyCreatedAt.toISOString(),
      updated_at: replyCreatedAt.toISOString(),
    }
    commentIndex += 1

    comments.push(replyComment)

    if (latestChapter) {
      const spoilerCreatedAt = new Date(baseCreatedAt.getTime() + (40 * 60 * 1000))
      const chapterComment = {
        id: toUuid(COMMENT_ID_PREFIX, commentIndex),
        manga_id: manga.id,
        chapter_id: latestChapter.id,
        user_id: tertiaryUser.id,
        parent_id: null,
        content: buildMangaCommentBody({
          title: manga.title,
          username: tertiaryUser.username,
          chapterNumber: 3,
          spoiler: mangaIndex % 3 === 0,
        }),
        likes: 2 + (mangaIndex % 4),
        dislikes: mangaIndex % 2,
        is_spoiler: mangaIndex % 3 === 0,
        is_pinned: false,
        is_active: true,
        created_at: spoilerCreatedAt.toISOString(),
        updated_at: spoilerCreatedAt.toISOString(),
      }
      commentIndex += 1

      comments.push(chapterComment)
    }
  })

  logStep('Ornek yorumlar ekleniyor')
  for (const group of chunk(comments, COMMENT_BATCH_SIZE)) {
    await insertRowsWithOptionalColumns(
      client,
      'manga_comments',
      group,
      ['chapter_id', 'dislikes', 'is_spoiler', 'is_pinned'],
    )
  }

  return {
    mangaCount: mangas.length,
    chapterCount: chapters.length,
    commentCount: comments.length,
  }
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeAdmin: true })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    fail(`Eksik degisken: SUPABASE_URL (veya VITE_SUPABASE_URL) ve SUPABASE_SERVICE_ROLE_KEY gerekli. ${getAdminEnvSetupHint()}`)
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(cwd, BACKUP_DIR, `manga-catalog-pre-reset-${timestamp}.json`)

  const existing = await createBackupSnapshot(client, backupPath)
  await cleanupExistingCatalog(client, existing)
  const dependencies = await ensureDependencies(client)
  const seeded = await seedShowcaseCatalog(client, dependencies)

  logStep('Tamamlandi')
  console.log(`Backup file: ${backupPath}`)
  console.log(`Old mangas deleted: ${existing.mangas.length}`)
  console.log(`Old chapters deleted: ${existing.chapters.length}`)
  console.log(`Old comments deleted: ${existing.comments.length}`)
  console.log(`New mangas added: ${seeded.mangaCount}`)
  console.log(`New chapters added: ${seeded.chapterCount}`)
  console.log(`New comments added: ${seeded.commentCount}`)
}

main().catch((error) => {
  console.error('\nManga reset/seed script error:')
  console.error(error)
  process.exit(1)
})
