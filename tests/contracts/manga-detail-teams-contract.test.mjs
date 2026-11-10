/**
 * Series detail > "Translating teams" + chapter reporting contract.
 *
 * Protected intent:
 * 1. The team list derives from CHAPTERS. No "translating team" column on the manga side:
 * the permission key is chapters.fansub_id.
 * 2. "MAIN TEAM" is a measurable definition: most chapters, on a tie the first uploader.
 * 3. The chapter report button is tied to the REAL report flow; it shows no "inactive" toast in
 * front of a working pipeline.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  const stub = new Proxy({}, { get: () => new Proxy(() => ({}), { get: () => () => {} }) })
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, (id) => (id === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) } : stub))
  return shim.exports
}

const teams = loadModule('src/pages/mangaDetail/mangaDetailTeams.ts')

function chapter(fansubId, createdAt, chapterNumber) {
  return {
    id: `${fansubId}-${chapterNumber}`,
    mangaId: 'm1',
    chapterNumber,
    pages: [],
    createdAt,
    fansub: { id: fansubId, name: `Ekip ${fansubId}`, slug: `ekip-${fansubId}` },
  }
}

// ---------- A) With no chapters the block is not drawn ----------
assert.deepEqual(teams.deriveTranslationTeams([]), [], 'no chapters means no team either')

// ---------- B) Chapters with no fansub are not counted ----------
{
  const rows = teams.deriveTranslationTeams([
    { id: 'x', mangaId: 'm1', chapterNumber: 1, pages: [], createdAt: '2026-01-01T00:00:00.000Z' },
  ])
  assert.deepEqual(rows, [], 'a chapter with no fansub must not produce a team')
}

// ---------- C) Shares by total chapters, MAIN TEAM is the top uploader ----------
{
  const rows = teams.deriveTranslationTeams([
    chapter('a', '2026-01-05T00:00:00.000Z', 3),
    chapter('a', '2026-01-03T00:00:00.000Z', 2),
    chapter('a', '2026-01-01T00:00:00.000Z', 1),
    chapter('b', '2026-01-09T00:00:00.000Z', 4),
  ])
  assert.equal(rows.length, 2, 'two separate teams make two rows')
  assert.equal(rows[0].fansub.id, 'a', 'the top uploader comes first')
  assert.equal(rows[0].isMain, true, 'the top uploader is the MAIN TEAM')
  assert.equal(rows[1].isMain, false, 'the second team is not the MAIN TEAM')
  assert.equal(rows[0].chapterCount, 3)
  assert.equal(rows[0].share, 0.75, '3/4 pay')
  assert.equal(rows[1].share, 0.25, '1/4 pay')
  assert.equal(
    rows[0].lastUploadAt,
    '2026-01-05T00:00:00.000Z',
    'last upload must be the date of the NEWEST chapter (not the first seen)',
  )
}

// ---------- C2) COK YUKLEYEN, GEC BASLAMIS OLSA DA once gelir ----------
/*
 * Without this case the contract was blind: in C the top uploader was also the first to start,
 * so deleting the "sort by chapter count" step did not break the test.
 * Here the two measures DELIBERATELY point opposite ways.
 */
{
  const rows = teams.deriveTranslationTeams([
    chapter('once', '2026-01-01T00:00:00.000Z', 1),
    chapter('sonra', '2026-05-01T00:00:00.000Z', 2),
    chapter('sonra', '2026-05-02T00:00:00.000Z', 3),
    chapter('sonra', '2026-05-03T00:00:00.000Z', 4),
  ])
  assert.equal(
    rows[0].fansub.id,
    'sonra',
    'sort must be by chapter count FIRST; first upload is only a tie breaker',
  )
  assert.equal(rows[0].isMain, true)
  assert.equal(rows[1].fansub.id, 'once')
}

// ---------- D) Esitlikte SERIYI BASLATAN kazanir ----------
{
  const rows = teams.deriveTranslationTeams([
    chapter('gec', '2026-06-01T00:00:00.000Z', 2),
    chapter('erken', '2026-01-01T00:00:00.000Z', 1),
  ])
  assert.equal(
    rows[0].fansub.id,
    'erken',
    'on equal chapter counts the first uploader must be the MAIN TEAM',
  )
  assert.equal(rows[0].isMain, true)
}

// ---------- E) The meta row has count + last upload ----------
{
  const [row] = teams.deriveTranslationTeams([chapter('a', '2026-01-05T00:00:00.000Z', 1)])
  const meta = teams.formatTeamMeta(row)
  assert.match(meta, /1 bölüm/, 'meta must write the chapter count')
  assert.match(meta, /son yükleme/, 'meta must write the last upload date')
}

// ---------- F) Panel bloku ekip listesini turetmeden basmaz ----------
{
  const panel = read('src/pages/mangaDetail/MangaDetailInfoPanel.tsx')
  assert.match(panel, /deriveTranslationTeams\(chapters\)/, 'the panel must derive teams from chapters')
  assert.match(panel, /data-testid="manga-detail-teams"/)
  assert.match(panel, /ANA EKIP/)
  assert.match(
    panel,
    /teams\.length > 0 \? \(/,
    'with no team no empty heading must remain',
  )
  assert.match(
    panel,
    /sürüm seçiciyle hangi ekibin çevirisini okuyacağını/,
    'the link between the version picker and team list must be explained',
  )
  assert.doesNotMatch(
    panel,
    /seal-check|verified|Verified|dogrulan/,
    'the fansubs table has NO verified field; printing a tick would be a lying surface',
  )
}

// ---------- G) Bolum raporlama gercek akisa bagli ----------
{
  const list = read('src/pages/mangaDetail/MangaDetailChapterList.tsx')
  const page = read('src/pages/MangaDetailPage.tsx')
  assert.match(list, /onReportChapter\(activeVersion\.id\)/,
    'what is reported must be the version the USER SELECTED')
  assert.match(page, /setReportTargetType\('chapter'\)/)
  assert.match(page, /onReportChapter=\{isReportsEnabled \? handleReportChapter : undefined\}/,
    'with the report flag off the button must not connect to the real flow')
}

console.log('manga-detail-teams-contract: OK')
