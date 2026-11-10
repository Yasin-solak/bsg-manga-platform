import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'

// Game Corner v1 (Mürek + Today's Cover): rules are pinned. No paid entry/luck, a daily coin
// cap, guesses and coins on the server, answer/cover URL do not reach the client until the game ends.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function loadTs(path, resolve = () => ({})) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => (name === '@/i18n/activeLocale' ? activeLocaleShim : resolve(name)), exports)
  return exports
}

const require = createRequire(import.meta.url)
const loadTsWithZod = (path) => loadTs(path, (name) => (name === 'zod' ? require('zod') : {}))

// --- Veritabani ---------------------------------------------------------------------------
const sql = read('supabase/migrations/20261004190000_daily_games_cover.sql')
assert.match(sql, /revoke all on table public\.daily_game_puzzles from public, anon, authenticated;/, 'the answer table is closed to clients')
assert.match(sql, /revoke all on table public\.daily_game_plays from public, anon, authenticated;/)
assert.match(sql, /create or replace function app_private\.daily_game_daily_coin_cap\(\)[\s\S]*?select 30/, 'gunluk oyun coin tavani 30')
assert.match(sql, /least\(\s*app_private\.daily_game_reward_for_guess\(v_count\),\s*greatest\(0, app_private\.daily_game_daily_coin_cap\(\) - app_private\.daily_game_coin_earned/, 'the reward clips to the cap')
assert.doesNotMatch(sql, /pg_catalog\.(least|greatest)\(/, 'least/greatest are SQL constructs, not pg_catalog functions')
assert.match(sql, /for update;/, 'concurrent guesses go in order')
assert.match(sql, /GAME_GUESS_DUPLICATE/)
assert.match(sql, /GAME_FINISHED/)
assert.match(sql, /'daily_game', p_kind \|\| ':' \|\| v_date::text \|\| ':' \|\| v_user_id::text, 'credit'/, 'ledger idempotent ref')
assert.match(sql, /o\.cover_image_url = m\.cover_image_url\) = 1/, 'only series with a unique cover become puzzles')
assert.match(sql, /grant execute on function public\.daily_game_image_source\(text, uuid\) to service_role;/)
assert.match(sql, /revoke all on function public\.daily_game_image_source\(text, uuid\) from public, anon, authenticated;/, 'only the proxy reads the image source')
assert.match(sql, /grant execute on function public\.submit_daily_game_guess\(text, uuid\) to authenticated;/)
// The snapshot adds the answer only when the game ends.
assert.match(sql, /if v_finished then\s*select pg_catalog\.jsonb_build_object\('id', m\.id, 'title', m\.title/)

// The client reward table matches the server.
const murek = loadTs('src/lib/murek.ts')
const sqlRewards = sql.match(/array\[([\d,\s]+)\]\)\[p_guess_count\]/)[1].split(',').map((value) => Number(value.trim()))
assert.deepEqual([...murek.DAILY_COVER_REWARDS], sqlRewards)
assert.equal(murek.dailyCoverRewardFor(1), 20)
assert.equal(murek.dailyCoverRewardFor(7), 0)

// Feed Mürek: the face of daily quest progress.
assert.equal(murek.resolveMurekFeedState(0, 0), null)
assert.equal(murek.resolveMurekFeedState(0, 3).mood, 'hungry')
assert.equal(murek.resolveMurekFeedState(1, 3).mood, 'idle')
assert.equal(murek.resolveMurekFeedState(3, 3).mood, 'full')
assert.equal(murek.resolveMurekFeedState(9, 3).ratio, 1)
assert.equal(
  murek.buildDailyGameShareText({ date: '2026-10-04', guesses: [{ correct: false }, { correct: true }], maxGuesses: 6, solved: true }),
  'Günün Kapağı 2026-10-04 · 2/6 🟥🟩',
)

// --- Gorsel proxy'si ------------------------------------------------------------------------
const proxy = await import('../../functions/api/game/daily-image.js')
assert.equal(proxy.blurForStage(0), proxy.STAGE_BLUR[0])
assert.ok(proxy.STAGE_BLUR.every((value, index, list) => index === 0 || value < list[index - 1]), 'sharper at each wrong guess')
assert.equal(proxy.blurForStage(6), 0, 'oyun bitince net')
assert.equal(proxy.blurForStage(-1), proxy.STAGE_BLUR[0])
assert.equal(proxy.resolveImageSource('/covers/a.webp', 'https://site.test').toString(), 'https://site.test/covers/a.webp')
assert.equal(proxy.resolveImageSource('//evil.test/a.webp', 'https://site.test'), null)
assert.equal(proxy.resolveImageSource('http://plain.test/a.webp', 'https://site.test'), null)
const proxySource = read('functions/api/game/daily-image.js')
assert.match(proxySource, /env\.SUPABASE_SERVICE_ROLE_KEY/)
assert.match(proxySource, /if \(blur > 0 && \(!resized \|\| \/err=\/i\.test\(resized\)\)\)/, 'no sharp image leaks without a transform')
assert.match(proxySource, /'cache-control': 'private, no-store'/)

// --- Istemci ---
const gameService = loadTsWithZod('src/services/dailyGameService.ts')
assert.equal(gameService.parseDailyGameSnapshot(null), null)
assert.equal(gameService.parseDailyGameSnapshot({ kind: 'quiz', date: '2026-10-04' }), null, 'bilinmeyen oyun reddedilir')
assert.equal(gameService.parseDailyGameSnapshot({ kind: 'panel', date: '2026-10-04', available: false }).available, false, '"coming soon" while the panel is off')
assert.equal(gameService.parseDailyRunStatus({ kind: 'runner', date: '2026-10-04', attemptsLeft: 2, bestScore: null }).attemptsLeft, 2)
assert.equal(gameService.parseDailyRunStatus({ kind: 'cover', date: '2026-10-04' }), null)
const parsedGame = gameService.parseDailyGameSnapshot({ kind: 'cover', date: '2026-10-04', available: true, guesses: [{ mangaId: 'a', title: null, correct: false }], stage: 'x' })
assert.equal(parsedGame.stage, 0, 'a broken number falls to the default')
assert.equal(parsedGame.maxGuesses, 6)
assert.equal(parsedGame.answer, null)
assert.equal(gameService.toDailyGameErrorMessage(new Error('GAME_GUESS_DUPLICATE')), 'Bu seriyi zaten denedin.')

// Guess page (shared by cover + panel): no cover in suggestions, title only.
const page = read('src/pages/games/DailyGuessGamePage.tsx')
assert.match(page, /fetchDailyGameImage\(kind, controller\.signal\)/)
assert.doesNotMatch(page, /suggestion\.cover|suggestion\.coverImage/, 'onerilerde kapak gosterilmez')
assert.match(page, /\.map\(\(manga\) => \(\{ id: manga\.id, title: manga\.title \}\)\)/, 'suggestions carry only the title')
assert.match(read('src/pages/games/DailyCoverGamePage.tsx'), /<DailyGuessGamePage kind='cover' \/>/)
assert.match(read('src/pages/games/DailyPanelGamePage.tsx'), /<DailyGuessGamePage kind='panel' \/>/)
const service = read('src/services/dailyGameService.ts')
assert.match(service, /supabase\.rpc\(name, args\)/)
assert.match(service, /`\/api\/game\/daily-image\?kind=\$\{kind\}`/)

const app = read('src/App.tsx')
assert.match(app, /<Route path='oyunlar' element=\{<GamesPage \/>\} \/>/)
assert.match(app, /<Route path='oyunlar\/gunun-kapagi' element=\{<DailyCoverGamePage \/>\} \/>/)
assert.match(app, / {2}GamesPage,\n {2}DailyCoverGamePage,\n {2}DailyPanelGamePage,\n {2}MurekRunPage,\n {2}CoverMatchPage,/, 'in the prerender module list')
for (const [path, element] of [['panel-avi', 'DailyPanelGamePage'], ['murek-kosusu', 'MurekRunPage'], ['kapak-esle', 'CoverMatchPage']]) {
  assert.ok(app.includes(`<Route path='oyunlar/${path}' element={<${element} />} />`), `${path} rotasi`)
}
const desktopNav = read('src/components/home/desktop/DesktopHomeNav.tsx')
// Cok dilli (2026-11-03): menu etiketleri sozlukten.
assert.match(desktopNav, /\['\/oyunlar', t\('nav\.games'\)\], \['\/sans', t\('nav\.lucky'\)\]/, 'Games and Lucky in the desktop menu')
assert.ok(read('src/i18n/messages/tr.ts').includes("'nav.games': 'Oyunlar'"), 'Oyunlar etiketi')
assert.match(read('src/components/layout/MobileMenuPanel.tsx'), /<MenuRow to="\/oyunlar"/)
assert.match(read('src/pages/LuckyPickPage.tsx'), /lg:max-w-4xl/, 'Lucky has a wide layout on desktop')
assert.match(read('src/components/home/HomeRightSidebar.tsx'), /resolveMurekFeedState\(dailyDone, \(dailies \?\? \[\]\)\.length\)/)

// --- v2: Panel Avi + deneme oyunlari (kosu, esleme) ---------------------------------------
const v2 = read('supabase/migrations/20261004220000_daily_games_v2.sql')
assert.match(v2, /pg\.ord >= 3 and pg\.page not ilike '%placehold%'/, 'panel only with real frames outside the first two pages')
assert.match(v2, /\) < 8 then\s*return v_row;/, 'without enough variety the panel does not open')
assert.match(v2, /create or replace function app_private\.daily_game_run_attempts\(\)[\s\S]*?select 3/, 'gunde 3 deneme')
assert.match(v2, /pg_advisory_xact_lock/, 'concurrent starts do not break the credit count')
assert.match(v2, /v_score := least\(greatest\(coalesce\(p_score, 0\), 0\), v_elapsed_s \* 12 \+ 20\);/, 'the run score clips by time')
assert.match(v2, /v_score := v_elapsed_s;/, 'the server measures the match time')
assert.match(v2, /GAME_RUN_IMPLAUSIBLE/)
assert.match(v2, /greatest\(0, v_tier - v_prev\)/, 'rewards are incremental: the same tier is not paid twice')
assert.match(v2, /'run:' \|\| v_run\.id::text, 'credit'/, 'attempt reward ledger ref')
assert.match(v2, /from public\.daily_game_runs where user_id = p_user_id and run_date = p_date/, 'ortak tavan deneme oyunlarini da sayar')
assert.match(v2, /revoke all on table public\.daily_game_runs from public, anon, authenticated;/)
assert.match(v2, /grant execute on function public\.finish_daily_game_run\(uuid, integer, integer\) to authenticated;/)
assert.doesNotMatch(v2, /pg_catalog\.(least|greatest)\(/)

// Client tiers match the server.
const clock = loadTs('src/lib/gameClock.ts')
assert.deepEqual(clock.RUNNER_TIERS.map((tier) => [tier.score, tier.coin]), [[1500, 8], [800, 6], [400, 4], [150, 2]])
assert.match(v2, /when p_value >= 1500 then 8 when p_value >= 800 then 6 when p_value >= 400 then 4 when p_value >= 150 then 2 else 0/)
assert.deepEqual(clock.MATCH_TIERS.map((tier) => [tier.seconds, tier.coin]), [[35, 8], [50, 6], [80, 4]])
assert.match(v2, /when p_value <= 35 then 8 when p_value <= 50 then 6 when p_value <= 80 then 4 else 2/)
assert.equal(clock.formatCountdown(3_723_000), '01:02:03')
assert.equal(clock.msUntilNextGameDay(Date.UTC(2026, 9, 4, 20, 59, 0)), 60_000, 'Istanbul gece yarisi = 21:00 UTC')

// Run engine: score rate at top speed is below the server limit (12/s); collision and jump.
const runner = loadTs('src/lib/murekRunner.ts', (name) => (name === './gameClock' ? clock : {}))
const fast = runner.createRunnerState()
fast.time = 1000
for (let index = 0; index < 600; index += 1) { fast.obstacles = []; fast.nextSpawn = 1e9; runner.stepRunner(fast, 1 / 60) }
const perSecond = runner.runnerScore(fast) / 10
assert.ok(perSecond > 0 && perSecond <= 12, `score rate ${perSecond}/s must not exceed the server limit`)
const crash = runner.createRunnerState()
crash.obstacles = [{ x: runner.RUNNER_WORLD.murekX + 20, w: 30, h: 26, kind: 'blot' }]
crash.nextSpawn = 1e9
runner.stepRunner(crash, 1 / 60)
assert.equal(crash.over, true, 'engele degince oyun biter')
const hop = runner.createRunnerState()
runner.jump(hop)
runner.stepRunner(hop, 1 / 60)
assert.ok(hop.y < 0, 'zipla yukari kaldirir')
const vy = hop.vy
runner.jump(hop)
assert.equal(hop.vy, vy, 'no second jump in the air')
assert.equal(runner.mixHex('#000000', '#ffffff', 0.5), '#808080')

// Pixel Mürek: each mood on a valid grid; the run canvas uses the same data.
const sprite = loadTs('src/components/murek/murekSprite.ts')
for (const mood of Object.keys(sprite.MUREK_FACES)) {
  for (const [x, y] of sprite.murekFrame(mood, 0)) assert.ok(x >= 0 && x < 16 && y >= 0 && y < 16, `${mood} izgara disina tasmaz`)
}
assert.match(read('src/pages/games/MurekRunPage.tsx'), /murekFrame\(/)
assert.match(read('src/components/murek/Murek.tsx'), /shapeRendering='crispEdges'/, 'pixel sharpness')

console.log('PASS Games Corner: Murek, Cover of the Day rules, image proxy and navigation links')
