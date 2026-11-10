import { z } from 'zod'

export const reportFilters = { all: 'Tüm hesaplar', opened: 'Duyuruyu açanlar', clicked: 'Karta tıklayanlar', responded: 'Yanıt verenler', claimed: 'Ödül alanlar', premium: 'Premium hesaplar', banned: 'Yasaklı hesaplar' } as const
export const announcementReportSchema = z.object({
  id: z.string().uuid(), title: z.string(), kind: z.string(), measurementStartedAt: z.string(), generatedAt: z.string(),
  totals: z.object({ accounts: z.number(), uniqueOpens: z.number(), opens: z.number(), clicks: z.number(), uniqueClicks: z.number(),
    links: z.number(), uniqueLinks: z.number(), responses: z.number(), claims: z.number(), coins: z.number() }),
  segments: z.object({ active: z.number(), inactive: z.number(), banned: z.number(), premium: z.number(), standard: z.number(), verified: z.number(), unverified: z.number() }),
  daily: z.array(z.object({ day: z.string(), opens: z.number(), clicks: z.number(), links: z.number(), responses: z.number(), claims: z.number(), coins: z.number() })),
  options: z.array(z.object({ id: z.string(), label: z.string(), count: z.number() })),
  accounts: z.array(z.object({ user_id: z.string().uuid(), username: z.string(), avatar: z.string().nullable(), active: z.boolean(), banned: z.boolean(),
    premium: z.boolean(), verified: z.boolean(), level: z.number(), registered_at: z.string(), opened: z.boolean(), opens: z.number(), clicks: z.number(), links: z.number(),
    response: z.string().nullable(), response_at: z.string().nullable(), claimed_at: z.string().nullable(), claimed_coins: z.number(), last_activity: z.string().nullable() })),
  totalAccounts: z.number(),
})
export type AnnouncementReport = z.infer<typeof announcementReportSchema>
