type MockPeriod = '7d' | '30d' | 'month'

type PeriodFixture = {
  currentStart: string
  previousStart: string
  previousEnd: string
  firstDate: string
  dayCount: number
  current: Record<'users' | 'mangas' | 'community' | 'fansubs' | 'backlog', number>
  previous: Record<'users' | 'mangas' | 'community' | 'fansubs' | 'backlog', number>
  queueCurrent: [number, number, number, number]
  queuePrevious: [number, number, number, number]
  openFromArrivals: number
}

const GENERATED_AT = '2026-07-14T17:55:00.000Z'

const PERIOD_FIXTURES: Record<MockPeriod, PeriodFixture> = {
  '7d': {
    currentStart: '2026-07-07T21:00:00.000Z',
    previousStart: '2026-06-30T21:00:00.000Z',
    previousEnd: '2026-07-07T17:55:00.000Z',
    firstDate: '2026-07-08',
    dayCount: 7,
    current: { users: 91, mangas: 15, community: 388, fansubs: 1, backlog: 535 },
    previous: { users: 78, mangas: 12, community: 345, fansubs: 1, backlog: 572 },
    queueCurrent: [112, 350, 55, 18],
    queuePrevious: [125, 370, 60, 17],
    openFromArrivals: 172,
  },
  '30d': {
    currentStart: '2026-06-14T21:00:00.000Z',
    previousStart: '2026-05-15T21:00:00.000Z',
    previousEnd: '2026-06-14T17:55:00.000Z',
    firstDate: '2026-06-15',
    dayCount: 30,
    current: { users: 352, mangas: 49, community: 1570, fansubs: 2, backlog: 2184 },
    previous: { users: 318, mangas: 45, community: 1358, fansubs: 1, backlog: 2282 },
    queueCurrent: [420, 1500, 210, 54],
    queuePrevious: [450, 1560, 220, 52],
    openFromArrivals: 516,
  },
  month: {
    currentStart: '2026-06-30T21:00:00.000Z',
    previousStart: '2026-05-31T21:00:00.000Z',
    previousEnd: '2026-06-14T17:55:00.000Z',
    firstDate: '2026-07-01',
    dayCount: 14,
    current: { users: 181, mangas: 27, community: 760, fansubs: 2, backlog: 1050 },
    previous: { users: 166, mangas: 24, community: 701, fansubs: 1, backlog: 1098 },
    queueCurrent: [215, 720, 90, 25],
    queuePrevious: [230, 750, 92, 26],
    openFromArrivals: 284,
  },
}

const INVENTORY_TOTALS = {
  users: 27845,
  mangas: 1248,
  community: 52316,
  fansubs: 18,
  backlog: 680,
} as const

function round(value: number) {
  return Math.round(value * 100) / 100
}

function deltaPercent(current: number, previous: number) {
  return previous === 0 ? null : round(((current - previous) * 100) / previous)
}

const DAILY_WEIGHTS = [0.72, 0.96, 0.84, 1.18, 0.9, 1.08, 1.24] as const

function distribute(total: number, count: number, index: number, offset = 0) {
  const weights = Array.from({ length: count }, (_, dayIndex) => (
    DAILY_WEIGHTS[(dayIndex + offset) % DAILY_WEIGHTS.length]
      * (0.9 + ((dayIndex + 1) / Math.max(count, 1)) * 0.2)
  ))
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)
  const values = weights.map((weight) => Math.floor((total * weight) / weightTotal))
  let remainder = total - values.reduce((sum, value) => sum + value, 0)

  for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) {
    values[(cursor * 5 + offset) % count] += 1
  }

  return values[index]
}

function dateLabels(firstDate: string, count: number) {
  const start = new Date(`${firstDate}T00:00:00.000Z`)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

function createQualityRow(
  key: string,
  label: string,
  denominator: number,
  targetRate: number,
  previousDenominator: number,
  previousTargetRate: number,
  disclosure: string,
) {
  const numerator = Math.round((denominator * targetRate) / 100)
  const previousNumerator = Math.round((previousDenominator * previousTargetRate) / 100)
  const rate = round((numerator * 100) / denominator)
  const previousRate = round((previousNumerator * 100) / previousDenominator)
  return {
    key,
    label,
    status: 'available',
    numerator,
    denominator,
    rate,
    previousNumerator,
    previousDenominator,
    previousRate,
    deltaPoints: round(rate - previousRate),
    disclosure,
  }
}

/** Provides a presentable, repeatable summary for E2E screens without live data. */
export function createAdminDashboardAnalyticsMock(period: MockPeriod): unknown {
  const fixture = PERIOD_FIXTURES[period]
  const [approvalCurrent, communityCurrent, reportsCurrent, legalCurrent] = fixture.queueCurrent
  const [approvalPrevious, communityPrevious, reportsPrevious, legalPrevious] = fixture.queuePrevious

  const quality = [
    createQualityRow(
      'moderation_completion',
      'Moderasyon tamamlama',
      fixture.current.backlog,
      96,
      fixture.previous.backlog,
      93,
      'Dönemde kuyruğa giren işlerin mevcut terminal durum oranıdır.',
    ),
    createQualityRow(
      'community_approval',
      'Topluluk onay oranı',
      Math.max(1, Math.round(communityCurrent * 0.92)),
      93,
      Math.max(1, Math.round(communityPrevious * 0.92)),
      91,
      'Dönemde karara bağlanan topluluk içeriklerindeki onay payıdır.',
    ),
    createQualityRow(
      'report_closure',
      'Rapor çözüm oranı',
      reportsCurrent,
      78,
      reportsPrevious,
      74,
      'Canlı rapor moderasyonu açıkken dönem rapor kohortunun kapanma oranıdır.',
    ),
    createQualityRow(
      'legal_closure',
      'Yasal talep kapanma oranı',
      legalCurrent,
      84,
      legalPrevious,
      80,
      'Dönemde gelen yasal taleplerin kapanma oranıdır.',
    ),
  ]
  const score = round(quality.reduce((sum, item) => sum + item.rate, 0) / quality.length)
  const previousScore = round(
    quality.reduce((sum, item) => sum + item.previousRate, 0) / quality.length,
  )

  const metric = (
    key: keyof typeof INVENTORY_TOTALS,
    label: string,
    trendPolarity: 'higher_is_better' | 'lower_is_better' | 'neutral',
    comparisonBasis: 'created' | 'arrivals',
  ) => ({
    key,
    label,
    total: INVENTORY_TOTALS[key],
    currentPeriod: fixture.current[key],
    previousPeriod: fixture.previous[key],
    delta: fixture.current[key] - fixture.previous[key],
    deltaPercent: deltaPercent(fixture.current[key], fixture.previous[key]),
    unit: 'count',
    trendPolarity,
    comparisonBasis,
  })

  return {
    period: {
      key: period,
      timezone: 'Europe/Istanbul',
      currentStart: fixture.currentStart,
      currentEnd: GENERATED_AT,
      previousStart: fixture.previousStart,
      previousEnd: fixture.previousEnd,
      dayCount: fixture.dayCount,
      comparisonBasis: 'arrivals',
    },
    generatedAt: GENERATED_AT,
    metrics: [
      metric('users', 'Kullanıcılar', 'neutral', 'created'),
      metric('mangas', 'Manga', 'neutral', 'created'),
      metric('community', 'Topluluk', 'neutral', 'created'),
      metric('fansubs', 'Fansub', 'neutral', 'created'),
      metric('backlog', 'Bekleyen işler', 'lower_is_better', 'arrivals'),
      {
        key: 'operations',
        label: 'Operasyon kalitesi',
        total: score,
        currentPeriod: score,
        previousPeriod: previousScore,
        delta: round(score - previousScore),
        deltaPercent: null,
        unit: 'percent',
        trendPolarity: 'higher_is_better',
        comparisonBasis: 'quality_average',
      },
    ],
    queues: [
      {
        key: 'approval', label: 'Onay kuyruğu', status: 'available', currentTotal: 156,
        currentPeriodArrivals: approvalCurrent, previousPeriodArrivals: approvalPrevious,
        oldestQueuedAt: '2026-07-09T08:24:00.000Z',
      },
      {
        key: 'community', label: 'Topluluk moderasyonu', status: 'available', currentTotal: 482,
        currentPeriodArrivals: communityCurrent, previousPeriodArrivals: communityPrevious,
        oldestQueuedAt: '2026-07-10T12:10:00.000Z',
      },
      {
        key: 'reports', label: 'Rapor kuyruğu', status: 'available', currentTotal: 37,
        currentPeriodArrivals: reportsCurrent, previousPeriodArrivals: reportsPrevious,
        oldestQueuedAt: '2026-07-12T07:45:00.000Z',
      },
      {
        key: 'legal', label: 'Yasal talepler', status: 'available', currentTotal: 5,
        currentPeriodArrivals: legalCurrent, previousPeriodArrivals: legalPrevious,
        oldestQueuedAt: '2026-07-08T15:30:00.000Z',
      },
    ],
    quality,
    operationHealth: {
      status: 'available',
      score,
      previousScore,
      availableMetricCount: quality.length,
      totalMetricCount: quality.length,
      source: 'quality_average',
      disclosure: 'Mevcut kalite oranlarının aritmetik ortalamasıdır; API, veritabanı veya depolama telemetrisi değildir.',
    },
    series: dateLabels(fixture.firstDate, fixture.dayCount).map((date, index) => ({
      date,
      users: distribute(fixture.current.users, fixture.dayCount, index),
      mangas: distribute(fixture.current.mangas, fixture.dayCount, index, 2),
      community: distribute(fixture.current.community, fixture.dayCount, index, 4),
      fansubs: distribute(fixture.current.fansubs, fixture.dayCount, index, 1),
      backlogArrivals: distribute(fixture.current.backlog, fixture.dayCount, index, 3),
      backlogOpenFromArrivals: distribute(fixture.openFromArrivals, fixture.dayCount, index, 5),
    })),
    partialFailures: [],
  }
}
