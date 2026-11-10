import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (relativePath) => readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

const migration = read('supabase/migrations/20261103180000_fansub_monthly_rewards_closed_month.sql')
const monthly = read('src/components/admin/rewards/AdminRewardsMonthlyPreviewCard.tsx')
const rules = read('src/components/admin/rewards/AdminRewardsRulesCard.tsx')
const history = read('src/components/admin/rewards/AdminRewardsRunHistoryCard.tsx')
const utils = read('src/components/admin/rewards/adminRewardsUtils.ts')
const section = read('src/components/admin/AdminRewardsSection.tsx')

// The monthly fansub reward is paid only for finished months (server and UI).
assert.match(migration, /if v_month_start >= date_trunc\('month', now\(\)\)::date then/)
assert.match(utils, /export function lastClosedMonthInput/)
assert.match(monthly, /max=\{maxMonth\}/)
assert.match(monthly, /disabled=\{runLoading \|\| monthOpen \|\| completed \|\| previewLoading \|\| paying\.length === 0\}/)
// Dagitim sonucu (coin, bildirim, geri alinamaz) soyleyen pencereden gecer.
assert.match(monthly, /<AdminConfirmDialog/)
assert.match(monthly, /bildirim gider\. Bir ay yalnız bir kez dağıtılır; geri alınamaz\./)
assert.doesNotMatch(monthly, /<table/, 'Genis tablo yerine liste')
// Old records run before the month ended are marked in history.
assert.match(history, /Ay bitmeden/)
// The last payout comes only from a completed record; unpaid finished months are in the summary.
assert.match(section, /runs\.find\(\(run\) => run\.status === 'completed'\)/)
assert.match(section, /Dağıtılmamış biten ay/)
// Kurallar: kaydedilmemis degisiklik gorunur (eskiden "Pasif yap" sessizce kaydedilmemis kaliyordu).
assert.match(rules, /function useDirtyRows/)
assert.match(rules, /kaydedilmemiş değişiklik/)

// Deleting a quest also deletes claim records: through a dialog stating the result.
assert.match(section, /onDeleteRow=\{\(id\) => askDeleteTask\('user', id\)\}/)
assert.match(section, /onDeleteRow=\{\(id\) => askDeleteTask\('fansub', id\)\}/)
assert.match(section, /alma kayıtları kalıcı olarak silinir/)

console.log('PASS admin rewards v2 (finished month, distribution confirm, rule record state)')
