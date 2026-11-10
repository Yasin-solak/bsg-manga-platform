# Takviye "ne acilir" demo gorselleri

Takviye sekmesindeki "Takviyeyle ne acilir?" demosunda kullanilan ornek
gorseller. `FansubBoostOverview.tsx` icindeki sabitlerden referans verilir.

| Dosya | Kullanim | Sabit |
|-------|----------|-------|
| `fansub-avatar.png` | Demo vitrin avatari | `DEMO_FALLBACK_AVATAR` |
| `fansub-bg-1.png`, `fansub-bg-2.png` | Vitrin arka plani | `BOOST_BACKGROUND_EXAMPLES` |
| `boost-emoji-1.png`, `boost-emoji-2.png` | Yorumdaki supporter emoji | `BOOST_EMOJI_EXAMPLES` |
| `boost-sticker-1.png`, `boost-sticker-2.png` | Yorumdaki supporter cikartma | `BOOST_STICKER_EXAMPLES` |

## Notlar
- Emoji/cikartma gorselleri saglanan anime kedi setinden kirpildi; kareli
  (seffaf olmayan) arka plan kenardan flood-fill ile seffaflastirildi.
- Yeni gorsel koymak icin: ayni adlarla degistir ya da sabitlere yol ekle.
- Arka plan: 16:9, koyu/atmosferik; avatar: kare. Metin/logo icermesin.
