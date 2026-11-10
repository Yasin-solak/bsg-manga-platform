import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { untranslate } from './i18n-source.mjs'

const read = (relativePath) => untranslate(readFileSync(path.resolve(process.cwd(), relativePath), 'utf8'))

const section = read('src/components/admin/sections/AdminBoostSection.tsx')
const shared = read('src/components/admin/sections/adminBoost/adminBoostSection.shared.tsx')
const governance = read('src/lib/fansubBoostCapabilityGovernance.ts')

// Takviye v2 (2026-11-03): sekmeler, sade Turkce, etkisini soyleyen onaylar.
for (const [id, label] of [['capabilities', 'Ayrıcalıklar'], ['fansubs', 'Ekipler'], ['status', 'Durum']]) {
  assert.match(section, new RegExp(`id: '${id}', label: '${label}'`), `${label} tab`)
}
// Perk level changes and turning off the system switch go through confirmation.
assert.match(section, /const changeCapability = /)
assert.match(section, /Seviyesi yetmeyen ekipler ayrıcalığı kaybeder\./)
assert.match(section, /getFansubBoostDowngradeRule\(row\.capabilityKey\)\.detail/)
assert.match(section, /if \(nextValue\) \{\s+void saveFlag\(flag, true\)/, 'Acmak onaysiz, kapatmak onayli')
assert.match(shared, /offConsequence:/)
assert.match(section, /<AdminConfirmDialog/)
// Jargon yerine Turkce seviye adlari.
assert.match(shared, /\{ value: 'core', label: 'Herkese açık' \}/)
assert.doesNotMatch(section, /Capability yerlesimi|>Runtime<|Supporter ritmi|Eski snapshot|aktif grant|Reward state/, 'no technical jargon in UI text')
assert.doesNotMatch(governance, /'Yuzey gizlenir'|'Panel kapanir'/, 'Seviye dusme kurallari Turkce')

console.log('PASS admin boost v2 (tabs, confirmations, Turkish)')
