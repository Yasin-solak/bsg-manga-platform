import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (relativePath) => readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

const section = read('src/components/admin/games/AdminGamesSection.tsx')
const puzzles = read('src/components/admin/games/AdminGamesPuzzles.tsx')
const settings = read('src/components/admin/games/AdminGamesSettingsForm.tsx')
const overview = read('src/components/admin/games/AdminGamesOverview.tsx')

// Games v2 (2026-11-03): v2 tab strip and summary strip.
assert.match(section, /data-testid=\{`admin-games-tab-\$\{option\.value\}`\}/)
assert.doesNotMatch(section, /AdminFilterGroup/)
assert.match(overview, /data-testid='admin-games-strip'/)
// Planli bulmacanin cevabini degistirmek mevcut cevabi soyleyen onaydan gecer.
assert.match(puzzles, /const planned = overview\.puzzles\.find\(\(puzzle\) => puzzle\.date === date && puzzle\.kind === kind\)/)
assert.match(puzzles, /onClick=\{\(\) => ask\(manga\.id, manga\.title\)\}/)
// A save that closes an open game (goes live immediately) goes through confirmation.
assert.match(settings, /const closing = GAME_LABELS\.filter\(\(\[key\]\) => settings\.enabled\[key\] && !draft\.enabled\[key\]\)/)
assert.match(settings, /onClick=\{requestSave\}/)

console.log('PASS admin games v2 (strips, puzzle and disable confirmations)')
