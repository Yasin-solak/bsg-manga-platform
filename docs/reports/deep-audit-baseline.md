# Deep Audit Baseline

- Uretim tarihi: 2026-06-30T09:20:29.403Z
- API riskli yuzey: 33
- Session user-facing gap: 0
- Webhook yuzeyi: 0
- Schema hotspot: 105
- Complexity cycle: 3
- Kritik testsiz modul: 20
- Multi-tenant durumu: na

## Yeni Regresyonlar

- API timeout gap: yok
- Session user-facing gap: yok
- Webhook yuzeyi: yok
- Schema validation gap: yok
- Import cycle: src/components/store/StorePurchaseFlow.tsx -> src/components/store/StorePurchaseTargetSelect.tsx -> src/components/store/StorePurchaseFlow.tsx, src/pages/profile/profilePageLoader.ts -> src/pages/profile/profileE2eSnapshot.ts -> src/pages/profile/profilePageLoader.ts
- Kritik testsiz modul: yok
- Multi-tenant surface: yok
