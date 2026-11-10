import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/*
 * Fansub quests v2 + assigning quests to team members.
 * - Weekly fansub quests (week_*) look at real data, not an event counter,
 * the week matches the Istanbul ISO week; reward once a week (period_key).
 * - Assignment from the member panel uses the same Translation Studio RPC (permission in the DB).
 */
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261101090000_fansub_quests_weekly.sql').replace(/^\s*--.*$/gm, '')

assert.match(sql, /v_week_start timestamptz := date_trunc\('week', now\(\) at time zone 'Europe\/Istanbul'\) at time zone 'Europe\/Istanbul'/, 'hafta = Istanbul ISO hafta')
for (const metric of ['week_chapters_published', 'week_studio_pages_done', 'week_active_contributors', 'week_new_followers', 'week_notices_published', 'studio_pages_done', 'studio_chapters_published', 'notices_published', 'roles_defined']) {
  assert.match(sql, new RegExp(`elsif v_metric = '${metric}' then`), `metrik: ${metric}`)
}
// Weekly fansub progress comes from the metric, not the quest_progress counter.
assert.equal((sql.match(/not \((v_audience|v_quest\.audience) = 'fansub' and (q|v_quest)\.metric_key like 'week\\_%'\)/g) || []).length, 2, 'list_quests + claim_quest same branch')
assert.match(sql, /'fansub', 'weekly', 'week_chapters_published'/)
assert.match(sql, /on conflict \(slug\) do nothing/, 'the seed is rerunnable')
assert.doesNotMatch(sql, /delete from public\.quests/i, 'the old task is not deleted')

const tab = read('src/pages/fansubYonet/FansubYonetTasksTab.tsx')
assert.match(tab, /listQuests\('fansub', fansubId\)/)
assert.match(tab, /claimQuest\(quest\.questId, 'fansub', fansubId\)/, 'the reward goes to the fansub vault')
assert.match(tab, /testId='studio-weekly-quests'/, 'haftalik panel')
assert.match(read('src/pages/FansubYonetPage.tsx'), /<FansubYonetTasksTab[\s\S]*?onOpenTab=\{handleTabChange\}/)

const dialog = read('src/components/fansub/FansubMemberTaskAssignDialog.tsx')
assert.match(dialog, /await assignTasks\(\{[\s\S]*?assigneeId: member\.userId/, 'atama tl_task_write uzerinden')
assert.match(dialog, /disabled=\{!allowed\}/, 'a stage the member has no permission for cannot be selected')
const sheet = read('src/components/fansub/FansubMemberDetailSheet.tsx')
assert.match(sheet, /\{canAssign \? \(/, 'the Assign task button only with permission')
const panel = read('src/components/fansub/FansubMembershipPanel.tsx')
assert.match(panel, /setCanAssignTasks\(permissions\.has\('ceviri\.proje'\)\)/, 'assign permission ceviri.proje')

console.log('PASS fansub weekly tasks + member task assignment')
