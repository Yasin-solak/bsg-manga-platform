# Complexity Map

- App dosyasi: 1163
- Import cycle: 3
- Ortalama import derinligi: 4.02
- Maksimum import derinligi: 14
- Testsiz karmasik modul: 15

## En Riskli Moduller

| Dosya | Skor | Satir | Fan-in | Fan-out |
| --- | ---: | ---: | ---: | ---: |
| `src/lib/utils.ts` | 339 | 7 | 280 | 0 |
| `src/components/ui/button.tsx` | 320 | 74 | 262 | 1 |
| `src/components/ui/badge.tsx` | 238 | 49 | 194 | 1 |
| `src/services/supabase.ts` | 205 | 224 | 169 | 0 |
| `src/data/storeProducts.ts` | 145 | 245 | 115 | 1 |
| `src/services/logger.ts` | 130 | 125 | 105 | 0 |
| `src/components/ui/input.tsx` | 122 | 26 | 98 | 1 |
| `src/services/toastService.ts` | 117 | 120 | 94 | 0 |
| `src/types/index.ts` | 112 | 403 | 85 | 2 |
| `src/services/requestContext.ts` | 102 | 39 | 82 | 0 |

## Import Cycle

- src/components/store/StorePurchaseFlow.tsx -> src/components/store/StorePurchaseTargetSelect.tsx -> src/components/store/StorePurchaseFlow.tsx
- src/components/store/StorePurchaseFlow.tsx -> src/components/store/storeFansubPurchase.ts -> src/components/store/StorePurchaseFlow.tsx
- src/pages/profile/profilePageLoader.ts -> src/pages/profile/profileE2eSnapshot.ts -> src/pages/profile/profilePageLoader.ts

## AI Code Audit Heuristics

- Yuksek yorum yogunlugu: 15
- Tutorial style adaylari: 15
- Catchless async adaylari: 12
