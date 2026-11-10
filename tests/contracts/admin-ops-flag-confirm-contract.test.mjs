import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (relativePath) => readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

const section = read('src/components/admin/AdminOpsSection.tsx')
const maintenance = read('src/components/admin/ops/AdminOpsMaintenanceCard.tsx')

// The switch in the flag list saves instantly; turning off and enabling maintenance go through
// confirmation (the maintenance card used to ask while the same flag could be turned on from the list in one click).
assert.match(section, /onSaveFlag=\{requestSaveFlag\}/)
assert.match(section, /flag\.key === 'system\.maintenance' \? next === true : next === false/, 'turning maintenance off stays one step')
assert.match(section, /<AdminConfirmDialog request=\{flagConfirm\}/)
// On cancel the switch returns to its old state.
assert.match(section, /updateDraft\(flagConfirm\.flagId, \{ isEnabled: flagConfirm\.previous \}\)/)
// The maintenance card keeps its own two-step confirmation.
assert.match(maintenance, /Evet, bakım moduna al/)

console.log('PASS operations flag confirmation (disable and maintenance)')
