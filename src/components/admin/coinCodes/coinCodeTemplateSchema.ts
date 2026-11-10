import { z } from 'zod'

export const coinCodeTemplateSchema = z.object({
  label: z.string().trim().min(3, 'Şablon adı en az 3 karakter olmalıdır.').max(60),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, 'Prefix 2-8 harf veya rakamdan oluşmalıdır.'),
  value: z.number().int().min(1, 'Coin değeri en az 1 olmalıdır.').max(1_000_000_000),
  count: z.number().int().min(1).max(500, 'Kod adedi en fazla 500 olabilir.'),
  maxUses: z.number().int().min(1).max(10_000),
  targetType: z.enum(['user', 'fansub', 'both']),
})

export const coinCodeTemplateStorageSchema = coinCodeTemplateSchema.extend({
  id: z.string().min(1),
  custom: z.boolean().optional(),
})

export type CoinCodeTemplate = z.infer<typeof coinCodeTemplateStorageSchema>
