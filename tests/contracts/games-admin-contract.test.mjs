import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { untranslate } from './i18n-source.mjs'

// Game Corner management: rules from one settings row; admin RPCs permission checked; if a game is closed
// the server rejects; the client gets reward/tier/closed state from the server.
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
const require = createRequire(import.meta.url)

function loadTs(path, resolve = () => ({})) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)(resolve, exports)
  return exports
}

// --- Veritabani ---------------------------------------------------------------------------
const sql = read('supabase/migrations/20261005090000_daily_games_admin.sql')
assert.match(sql, /revoke all on table public\.daily_game_settings from public, anon, authenticated;/, 'the settings table is closed to clients')
assert.match(sql, /id boolean primary key default true check \(id\)/, 'single settings row')
for (const fn of ['admin_daily_games_overview', 'admin_update_daily_game_settings', 'admin_set_daily_puzzle']) {
  const body = sql.slice(sql.indexOf(`create or replace function public.${fn}`))
  assert.match(body.slice(0, 600), /if not app_private\.is_admin\(\) then\s*raise exception 'Bu islem icin yetkiniz yok\.';/, `${fn} admin only`)
  assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`), `${fn} closed to anon`)
}
assert.match(sql, /Bu bulmaca oynanmaya basladi; degistirilemez\./, 'oynanan bulmaca degistirilemez')
assert.match(sql, /p_date < v_today or p_date > v_today \+ 60/, 'gecmise bulmaca yazilmaz')

// Rules read from settings; defaults match old constants (behavior unchanged).
assert.match(sql, /daily_coin_cap integer not null default 30/)
assert.match(sql, /guess_rewards integer\[\] not null default '\{20,15,12,9,6,4\}'/)
assert.match(sql, /run_attempts integer not null default 3/)
assert.match(sql, /'\[\{"score":1500,"coin":8\},\{"score":800,"coin":6\},\{"score":400,"coin":4\},\{"score":150,"coin":2\}\]'/)
assert.match(sql, /'\[\{"seconds":35,"coin":8\},\{"seconds":50,"coin":6\},\{"seconds":80,"coin":4\}\]'/)
assert.match(sql, /match_finish_coin integer not null default 2/)
assert.match(sql, /panel_min_series integer not null default 8/)
assert.match(sql, /create or replace function app_private\.daily_game_daily_coin_cap\(\)[\s\S]*?from public\.daily_game_settings/)
assert.match(sql, /create or replace function app_private\.daily_game_reward_for_guess\(p_guess_count integer\)[\s\S]*?s\.guess_rewards\[p_guess_count\]/)
assert.match(sql, /\) < \(app_private\.daily_game_settings_row\(\)\)\.panel_min_series then/)

// A closed game: guesses and attempts are rejected, the snapshot says "disabled".
assert.equal((sql.match(/raise exception 'GAME_DISABLED' using errcode = 'P0001';/g) ?? []).length, 2, 'submit + start reject a disabled game')
assert.match(sql, /'available', false, 'disabled', true/)
assert.match(sql, /'enabled', app_private\.daily_game_enabled\(p_kind\),\s*'tiers',/)

// --- Istemci: admin servisi ----------------------------------------------------------------
const admin = loadTs('src/services/adminDailyGamesService.ts', (name) => (name === 'zod' ? require('zod') : {}))
const settings = {
  dailyCoinCap: 30, enabled: { cover: true, panel: true, runner: true, match: false },
  guessRewards: [20, 15, 12, 9, 6, 4], runAttempts: 3,
  runnerTiers: [{ score: 150, coin: 2 }], matchTiers: [{ seconds: 35, coin: 8 }], matchFinishCoin: 2, panelMinSeries: 8, updatedAt: null,
}
assert.equal(admin.validateDailyGameSettings(settings), null)
assert.ok(admin.validateDailyGameSettings({ ...settings, dailyCoinCap: 900 }))
assert.ok(admin.validateDailyGameSettings({ ...settings, guessRewards: [1, 2, 3] }), 'reward list has 6 items')
assert.ok(admin.validateDailyGameSettings({ ...settings, runnerTiers: [{ score: 0, coin: 2 }] }))
assert.equal(admin.parseDailyGameSettings(settings).enabled.match, false)
assert.equal(admin.parseDailyGamesOverview({ today: '2026-10-05', settings, puzzles: 'bozuk', daily: [], topEarners: [], suspiciousRuns: [] }).puzzles.length, 0, 'a broken field falls to an empty list')

// --- Client: tiers/rewards from the server ---------------------------------------------------------
const clock = loadTs('src/lib/gameClock.ts')
assert.equal(clock.runnerTierCoin(900), 6, 'default tiers')
assert.equal(clock.runnerTierCoin(900, [{ score: 500, coin: 3 }, { score: 1000, coin: 9 }]), 3, 'ozel kademeler')
assert.equal(clock.matchTierCoin(40, [{ seconds: 30, coin: 10 }], 1), 1, 'kademe disi: bitirme coini')
assert.equal(clock.maxTierCoin([{ coin: 4 }, { coin: 9 }]), 9)
const game = loadTs('src/services/dailyGameService.ts', (name) => (name === 'zod' ? require('zod') : {}))
const run = game.parseDailyRunStatus({ kind: 'runner', date: '2026-10-05', enabled: false, tiers: [{ score: 300, coin: 5 }] })
assert.equal(run.enabled, false)
assert.deepEqual(game.runnerTiersOf(run), [{ score: 300, coin: 5 }])
assert.equal(game.matchTiersOf(run), undefined, 'kosu kademesi eslemeye karismaz')
assert.deepEqual(game.parseDailyGameSnapshot({ kind: 'cover', date: '2026-10-05', available: true, rewards: [25, 20, 15, 10, 6, 4] }).rewards[0], 25)

assert.match(read('src/pages/games/DailyGuessGamePage.tsx'), /game\?\.rewards\?\.\[guessNumber - 1\] \?\? dailyCoverRewardFor\(guessNumber\)/)
assert.match(read('src/pages/games/MurekRunPage.tsx'), /runnerTiersOf\(status\) \?\? RUNNER_TIERS/)
assert.match(read('src/pages/games/CoverMatchPage.tsx'), /matchTiersOf\(status\) \?\? MATCH_TIERS/)
assert.match(read('src/pages/GamesPage.tsx'), /locked=\{runLocked\(overview\.runner\)\}/)

// --- Admin paneli baglantilari ----------------------------------------------------------------
assert.match(read('src/pages/admin/adminRoutes.ts'), /games: 'oyunlar',/)
assert.match(read('src/pages/admin/adminPageUtils.ts'), /\| 'games'/)
assert.match(read('src/pages/admin/adminNavigation.ts'), /id: 'games',\s*label: 'Oyunlar',/)
const adminPage = read('src/pages/AdminPage.tsx')
assert.match(adminPage, /lazy\(\(\) => import\('@components\/admin\/games\/AdminGamesSection'\)\)/)
assert.match(adminPage, /activeSection === 'games' && \(/)

console.log('PASS Games Corner admin: settings row, admin permission, disabled game and client wiring')
