import assert from 'node:assert/strict'
import { activeLocaleShim } from './i18n-source.mjs'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
let enabled = true, response = { data: [{ id: 'manga-a', matched_genres: ['Macera'] }], error: null }
const calls = []
const dependencies = {
  './supabase': { supabase: { rpc: (name, params) => { calls.push({ name, params }); return response } } },
  './featureFlagService': { isFeatureEnabled: async () => enabled },
  './apiResilience': { withAbortSignal: value => value, withServiceTimeout: work => work(new AbortController().signal) },
  './userFacingError': { toUserFacingErrorMessage: () => 'Hata' },
  './logger': { createScopedLogger: () => ({ warn() {} }) },
  '@/i18n/activeLocale': activeLocaleShim,
  './mangaService/shared': { mapDbManga: row => ({ id: row.id }) },
}
const module = { exports: {} }
new Function('module', 'exports', 'require', ts.transpileModule(read('src/services/recommendationService.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports, name => {
  assert.ok(dependencies[name], name)
  return dependencies[name]
})
const service = module.exports
for (const source of ['reading', 'genres']) {
  assert.deepEqual(await service.getRecommendedMangasBySource(source), [{ manga: { id: 'manga-a' }, matchedGenres: ['Macera'] }])
  assert.deepEqual(calls.at(-1), { name: 'get_recommended_mangas_by_source', params: { p_source: source, p_limit: 14 } })
}
await service.getRecommendedMangas(14)
assert.equal(calls.at(-1).name, 'get_recommended_mangas')
enabled = false
const before = calls.length
assert.deepEqual(await service.getRecommendedMangasBySource('genres'), [])
assert.equal(calls.length, before)
enabled = true
response = { data: null, error: new Error('network') }
await assert.rejects(service.getRecommendedMangasBySource('reading'), /network/)
response = { data: [], error: null }
assert.deepEqual(await service.getRecommendedMangasBySource('genres'), [])
const sql = read('supabase/migrations/20260916162125_recommendation_genre_keys.sql')
assert.match(sql, /where p_source = 'reading'/)
assert.match(sql, /where p_source = 'genres'/)
assert.match(sql, /where c.genre_score > 0/)
assert.match(sql, /auth.uid\(\) is not null/)
assert.match(sql, /m.is_mature = false or app_private.current_user_is_adult\(\)/)
assert.match(sql, /not exists \(select 1 from excluded/)
assert.match(sql, /when 'macera' then 'adventure'/)
console.log('PASS suggestion sources, error/empty result, identity and genre scope')
