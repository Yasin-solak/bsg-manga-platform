import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// --- Profil efekti her yuzeyde icerigin onunde ----------------------------------------------
assert.match(read('src/components/profileEffects/layering.ts'), /PROFILE_EFFECT_TOP_LAYER = 'z-\[60\]'/)
assert.match(read('src/components/profileEffects/ProfileEffectLayer.tsx'), /pointer-events-none absolute inset-0/, 'efekt tiklamalari gecirir')
for (const file of [
  'src/components/common/UserHoverCardSurface.tsx',
  'src/components/common/FansubHoverCardSurface.tsx',
  'src/components/common/FansubHoverCard.tsx',
  'src/pages/profile/ProfileIdentityShowcase.tsx',
  'src/pages/profile/ProfileIdentityCard.tsx',
  'src/pages/fansub/FansubIdentityCard.tsx',
  'src/pages/fansub/FansubShowcaseHero.tsx',
]) {
  const source = read(file)
  const tag = source.slice(source.indexOf('<ProfileEffectLayer'), source.indexOf('<ProfileEffectLayer') + 260)
  assert.match(tag, /className=\{PROFILE_EFFECT_TOP_LAYER\}/, `${file}: efekt icerigin onunde`)
}

console.log('PASS profile effect in front of content on every surface (hover card, profile, fansub)')
