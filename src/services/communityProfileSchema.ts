import { z } from 'zod'
const uuid=z.string().uuid()
export const communityProfileSchema = z.object({
  id: uuid, name: z.string(), description: z.string(), rules: z.string(), avatar_url: z.string().nullable(),
  banner_url: z.string().nullable(), slug: z.string(), owner_id: uuid, kind: z.enum(['fansub', 'room']),
  join_mode: z.enum(['open', 'invite', 'request']), archived_at: z.string().nullable(), version: z.number(),
  transfer_to: uuid.nullable().optional(), transfer_until: z.string().nullable().optional(),
})
export type CommunityProfile = z.infer<typeof communityProfileSchema>
