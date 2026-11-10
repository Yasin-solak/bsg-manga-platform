import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const migrationDir = 'supabase/migrations'
const migrationFiles = readdirSync(migrationDir)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right, 'tr'))

const sensitiveHelpers = [
  'current_public_user_id',
  'is_admin',
  'can_manage_moderation_state',
  'is_fansub_admin',
  'is_fansub_staff',
  'is_feature_enabled',
  'is_user_blocked_between',
  'is_user_manga_list_owner',
  'user_has_any_fansub_membership',
  'can_create_fansub_request_daily',
  'can_current_user_access_chapter',
  'fansub_has_boost_capability',
  'can_read_public_user_row',
  'can_write_pending_community_post_child',
  'can_write_pending_community_poll_child',
  'is_current_user_premium_active',
  'is_fansub_staff_of_user',
]

const latestPublicFunctions = new Map()
const createFunctionPattern = /create\s+or\s+replace\s+function\s+public\.([a-zA-Z0-9_]+)\s*\(/ig

function findFunctionEnd(sql, startIndex) {
  const remaining = sql.slice(startIndex)
  const dollarQuoteEnd = remaining.match(/\n\s*(?:\$[A-Za-z0-9_]*\$|\$\$);/)
  if (dollarQuoteEnd?.index != null) {
    return startIndex + dollarQuoteEnd.index + dollarQuoteEnd[0].length
  }

  const nextStatement = remaining.match(
    /\n(?=(?:create\s+or\s+replace\s+function|create\s+function|grant\s+|revoke\s+|drop\s+function|create\s+trigger|drop\s+trigger|alter\s+table|alter\s+policy|create\s+policy|notify\s+|commit\s*;|begin\s*;|do\s+\$\$))/i,
  )

  return nextStatement?.index == null ? sql.length : startIndex + nextStatement.index
}

for (const fileName of migrationFiles) {
  const sql = readFileSync(path.join(migrationDir, fileName), 'utf8')
  let match

  while ((match = createFunctionPattern.exec(sql)) !== null) {
    latestPublicFunctions.set(match[1], {
      fileName,
      body: sql.slice(match.index, findFunctionEnd(sql, createFunctionPattern.lastIndex)),
    })
  }
}

const violations = []

for (const [functionName, { fileName, body }] of latestPublicFunctions.entries()) {
  if (/security\s+definer/i.test(body)) continue

  for (const helperName of sensitiveHelpers) {
    if (helperName === functionName) continue

    const publicCall = new RegExp(`public\\.${helperName}\\s*\\(`, 'i')
    const unqualifiedCall = new RegExp(`(?<![A-Za-z0-9_\\.])${helperName}\\s*\\(`, 'i')

    if (publicCall.test(body) || unqualifiedCall.test(body)) {
      violations.push(`${fileName} :: ${functionName} -> ${helperName}`)
    }
  }
}

assert.deepEqual(
  violations,
  [],
  'Security invoker public fonksiyonlar revoked/helper RPC yuzeyine public veya unqualified cagri yapmamali.',
)

console.log('PASS Supabase public invoker helper regression contract kept')
