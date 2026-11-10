/**
 * Series type + mature content (18+) contract.
 *
 * Protected decisions:
 *
 * 1. SERIES TYPE IS A SEPARATE COLUMN. `original_lang` is the SOURCE LANGUAGE, not the type. A Korean
 * webtoon and a Korean manhwa are both 'ko', so deriving type from language would be
 * guessing. Language is used only for the INITIAL VALUE.
 * 2. THE 18+ GATE IS ENFORCED IN RLS. Hiding it in the UI is not enough: it could be read
 * with a direct query. Both `mangas` and `chapters` policies are covered;
 * hiding the manga while leaving the chapter open would open pages to anyone
 * knowing the chapter id.
 * 3. UNKNOWN AGE DOES NOT COUNT AS ADULT. The opposite assumption would open 18+ content to everyone
 * with no birth date. Measured with live data: no date ->
 * false, 16 -> false, 1 day before 18 -> false, exactly 18 -> true.
 * 4. The age check opens ON THE 18TH BIRTHDAY (<=, not <).
 * 5. The admin and the uploading fansub's officer keep seeing their own content;
 * otherwise a person uploading an 18+ series could not edit their own upload.
 * 6. Flag changes are written to the AUDIT LOG: not a cosmetic badge but
 * the key to a gate cutting an audience off from content entirely.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')
const stripSqlComments = (source) => source.replace(/^\s*--.*$/gm, '')

const migration = stripSqlComments(read('supabase/migrations/20260821090000_series_type_and_maturity.sql'))
const mutations = read('src/services/adminService/mangaControl.mutations.manga.ts')

// 1. Tur ayri kolon, dilden yalnizca tohumlanir.
assert.match(migration, /add column if not exists series_type text/, 'the series_type column must be added')
assert.match(
  migration,
  /check \(series_type in \('manga', 'manhwa', 'manhua', 'webtoon', 'yerli'\)\)/,
  'the valid type list must be constrained in the database too',
)
assert.match(
  migration,
  /update public\.mangas[\s\S]*?original_lang in \('ja', 'jp'\)[\s\S]*?then 'manga'/,
  'the initial value must be seeded from the source language',
)

// 2. RLS gate: both manga and chapter.
assert.match(
  migration,
  /create policy mangas_select_public[\s\S]*?is_mature = false or app_private\.current_user_is_adult\(\)/,
  'manga visibility must be tied to the age gate',
)
assert.match(
  migration,
  /create policy chapters_select_public[\s\S]*?m\.is_mature[\s\S]*?not app_private\.current_user_is_adult\(\)/,
  'the chapter policy must be covered too; otherwise pages open by chapter id',
)

// 3-4. Age rule: no date means not adult, the limit is the 18th birthday.
assert.match(
  migration,
  /u\.birth_date is not null\s*\n?\s*and u\.birth_date <= \(current_date - interval '18 years'\)/,
  'no date must not count as adult and the limit must be the 18th birthday',
)
assert.match(
  migration,
  /coalesce\(\s*\(([\s\S]*?)\),\s*false\s*\)/,
  'an unknown state must fall to false',
)
assert.ok(
  !/birth_date < \(current_date - interval '18 years'\)/.test(migration),
  'the gate must be OPEN on the 18th birthday; strict less-than must not be used',
)

// 5. Yonetici / fansub yetkilisi disarida kalmamali.
for (const policy of ['mangas_select_public', 'chapters_select_public']) {
  const body = migration.slice(migration.indexOf(`create policy ${policy}`))
  assert.match(body, /app_private\.is_admin\(\)/, `${policy} admin dalini korumali`)
  assert.match(body, /app_private\.is_fansub_admin\(/, `${policy} fansub yetkilisi dalini korumali`)
}

// Migration 208 kurali: policy govdesinde public.* helper KULLANILMAZ.
const policyBlock = migration.slice(migration.indexOf('create policy mangas_select_public'))
assert.ok(
  !/using \([\s\S]*?public\.(is_admin|current_public_user_id)\(/.test(policyBlock),
  'policy govdesinde app_private.* sarmalayicilari kullanilmali (208 revoke u)',
)

// 6. Bayrak degisimi denetlenir.
assert.match(
  mutations,
  /setAdminMangaMature[\s\S]*?auditMangaMutation\(\{[\s\S]*?action: 'manga\.mature\.update'/,
  'an 18+ flag change must be written to the audit log',
)
assert.match(
  mutations,
  /setAdminMangaSeriesType[\s\S]*?SERIES_TYPES\.includes\(seriesType\)/,
  'an invalid type must also be filtered in the service layer',
)

console.log('PASS series type and mature content contract kept')
