export interface E2EMockReleaseScheduleEntry {
    chapterId: string
    mangaId: string
    mangaTitle: string
    mangaSlug: string
    mangaCoverImageUrl?: string
    fansubId?: string
    fansubName?: string
    fansubSlug?: string
    chapterNumber: number
    chapterTitle?: string
    publishAt: string
    isUpcoming: boolean
}

export interface E2EMockReleaseScheduleOptions {
    fansubId?: string | null
    from?: string | null
    daysAhead?: number
    limit?: number
}

type CoverImageFactory = (title: string, id: string) => string

function createReleaseDate(dayOffset: number, hour: number, minute = 0) {
    const date = new Date()
    date.setHours(hour, minute, 0, 0)
    date.setDate(date.getDate() + dayOffset)
    return date
}

function createMonthReleaseDate(monthOffset: number, day: number, hour: number, minute = 0) {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, day, hour, minute, 0, 0)
}

function createReleaseScheduleEntry(
    createCoverImageUrl: CoverImageFactory,
    {
        id,
        title,
        day,
        chapterNumber,
        chapterTitle,
        fansubId,
        fansubName,
    }: {
        id: string
        title: string
        day: Date
        chapterNumber: number
        chapterTitle: string
        fansubId: string
        fansubName: string
    },
): E2EMockReleaseScheduleEntry {
    const slug = title.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    return {
        chapterId: `e2e-chapter-${id}`,
        mangaId: `e2e-manga-${id}`,
        mangaTitle: title,
        mangaSlug: slug,
        mangaCoverImageUrl: createCoverImageUrl(title, id),
        fansubId,
        fansubName,
        fansubSlug: fansubName.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g, '-'),
        chapterNumber,
        chapterTitle,
        publishAt: day.toISOString(),
        isUpcoming: day.getTime() > Date.now(),
    }
}

const E2E_DENSE_MANGA_TITLES = [
    'Metro Avcilari',
    'Kizil Kule',
    'Ay Isigi Akademisi',
    'Demir Liman',
    'Son Seviye Lonca',
    'Golge Pazari',
    'Kutup Yildizi',
    'Neon Samuray',
    'Kristal Zindan',
    'Ruzgar Defteri',
    'Kara Rota',
    'Sonsuz Kat',
    'Yedinci Kapilar',
    'Mavi Hancer',
    'Gece Postasi',
    'Altin Vadi',
]

function createDenseReleaseScheduleEntries(
    createCoverImageUrl: CoverImageFactory,
    {
        prefix,
        dayOffset,
        count,
        startHour,
        minuteStep,
    }: {
        prefix: string
        dayOffset: number
        count: number
        startHour: number
        minuteStep: number
    },
): E2EMockReleaseScheduleEntry[] {
    return Array.from({ length: count }, (_, index) => {
        const minutesFromStart = index * minuteStep
        const hour = Math.min(23, startHour + Math.floor(minutesFromStart / 60))
        const minute = minutesFromStart % 60
        const titleBase = E2E_DENSE_MANGA_TITLES[index % E2E_DENSE_MANGA_TITLES.length]
        const fansubIndex = index % 3

        return createReleaseScheduleEntry(createCoverImageUrl, {
            id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
            title: `${titleBase} ${String(index + 1).padStart(2, '0')}`,
            day: createReleaseDate(dayOffset, hour, minute),
            chapterNumber: 40 + index,
            chapterTitle: index % 4 === 0 ? 'Cift yayin provasi' : 'Yogun gun testi',
            fansubId: `e2e-fansub-${fansubIndex + 1}`,
            fansubName: ['E2E Fansub', 'E2E Night Scan', 'E2E Rapid Team'][fansubIndex],
        })
    })
}

export function createDefaultE2EMockReleaseScheduleEntries(
    createCoverImageUrl: CoverImageFactory,
): E2EMockReleaseScheduleEntry[] {
    const createEntry = (entry: Parameters<typeof createReleaseScheduleEntry>[1]) => (
        createReleaseScheduleEntry(createCoverImageUrl, entry)
    )
    const createDenseEntries = (options: Parameters<typeof createDenseReleaseScheduleEntries>[1]) => (
        createDenseReleaseScheduleEntries(createCoverImageUrl, options)
    )

    return [
        createEntry({
            id: 'previous-month-archive',
            title: 'Nisan Arsivi',
            day: createMonthReleaseDate(-1, 24, 20, 30),
            chapterNumber: 8,
            chapterTitle: 'Gecmis ay finali',
            fansubId: 'e2e-fansub-1',
            fansubName: 'E2E Fansub',
        }),
        createEntry({
            id: 'past-1',
            title: 'Gecmis Avcisi',
            day: createReleaseDate(-5, 11, 0),
            chapterNumber: 12,
            chapterTitle: 'Eski izler',
            fansubId: 'e2e-fansub-1',
            fansubName: 'E2E Fansub',
        }),
        createEntry({
            id: 'past-2',
            title: 'Dun Gece Kulubu',
            day: createReleaseDate(-1, 21, 15),
            chapterNumber: 4,
            chapterTitle: 'Sessiz salon',
            fansubId: 'e2e-fansub-2',
            fansubName: 'E2E Night Scan',
        }),
        ...createDenseEntries({ prefix: 'past-dense', dayOffset: -2, count: 16, startHour: 8, minuteStep: 42 }),
        createEntry({
            id: 'today-released',
            title: 'Bugun Atesi',
            day: createReleaseDate(0, 9, 30),
            chapterNumber: 21,
            chapterTitle: 'Sabah kivilcimi',
            fansubId: 'e2e-fansub-1',
            fansubName: 'E2E Fansub',
        }),
        createEntry({
            id: 'today-late',
            title: 'Bugun Gece Nobeti',
            day: createReleaseDate(0, 23, 30),
            chapterNumber: 7,
            chapterTitle: 'Gece yayini',
            fansubId: 'e2e-fansub-2',
            fansubName: 'E2E Night Scan',
        }),
        ...createDenseEntries({ prefix: 'today-dense', dayOffset: 0, count: 30, startHour: 7, minuteStep: 28 }),
        createEntry({
            id: 'future-1',
            title: 'Yarin Ruzgari',
            day: createReleaseDate(1, 18, 0),
            chapterNumber: 33,
            chapterTitle: 'Yeni rota',
            fansubId: 'e2e-fansub-1',
            fansubName: 'E2E Fansub',
        }),
        ...createDenseEntries({ prefix: 'tomorrow-dense', dayOffset: 1, count: 22, startHour: 9, minuteStep: 31 }),
        createEntry({
            id: 'future-2',
            title: 'Gelecek Sehir',
            day: createReleaseDate(6, 20, 45),
            chapterNumber: 15,
            chapterTitle: 'Neon kapilar',
            fansubId: 'e2e-fansub-2',
            fansubName: 'E2E Night Scan',
        }),
        ...createDenseEntries({ prefix: 'future-dense', dayOffset: 6, count: 36, startHour: 6, minuteStep: 24 }),
        createEntry({
            id: 'future-3',
            title: 'Ay Sonu Efsanesi',
            day: createReleaseDate(12, 14, 10),
            chapterNumber: 44,
            chapterTitle: 'Son perde',
            fansubId: 'e2e-fansub-1',
            fansubName: 'E2E Fansub',
        }),
        createEntry({
            id: 'next-month-preview',
            title: 'Haziran Provasi',
            day: createMonthReleaseDate(1, 3, 16, 20),
            chapterNumber: 2,
            chapterTitle: 'Yeni ay',
            fansubId: 'e2e-fansub-1',
            fansubName: 'E2E Fansub',
        }),
    ].sort((a, b) => a.publishAt.localeCompare(b.publishAt))
}
