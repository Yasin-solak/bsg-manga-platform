/**
 * E2E mock fixtures must not ship in the production bundle.
 *
 * The mock modules are imported by services that every visitor loads (auth, admin user
 * snapshot), so their fixture data used to ride in the first-load chunks: 32 KB of mock store
 * and fansub data plus the fake admin user list inside the entry chunk.
 *
 * Pinned decisions:
 * 1. Each module that should be dropped declares its OWN compile-time switch. Vite replaces
 *    import.meta.env.DEV / MODE with literals; the bundler folds a constant only inside the
 *    module that declares it, so importing the switch from another module does not work.
 * 2. Every exported mock getter/setter tests that switch as the FIRST condition of its FIRST
 *    statement. Behind a function call (isE2EModeEnabled) the bundler cannot see it.
 * 3. Fixture state is built on first use. Module-level state created by function calls is
 *    never removed, whatever the getters do.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const SWITCH = 'E2E_MODE_COMPILED_IN'
const SWITCH_DECLARATION = /^(export )?const E2E_MODE_COMPILED_IN = import\.meta\.env\.DEV \|\| import\.meta\.env\.MODE === 'test'$/m
const MODULES = ['src/testing/e2eMocks.ts', 'src/testing/adminUsersE2e.ts', 'src/testing/adminUserInsightsE2e.ts']
// Exported functions that hand out or change mock data.
const GATED_NAME = /^(get|set|update)E2E/

function firstConditionOf(expression) {
  let current = expression
  while (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.BarBarToken) current = current.left
  return current
}

let gated = 0
for (const file of MODULES) {
  const text = readFileSync(file, 'utf8')
  assert.match(text, SWITCH_DECLARATION, `${file} must declare its own ${SWITCH} (an imported constant is not folded by the bundler)`)
  assert.doesNotMatch(text, new RegExp(`import \\{[^}]*\\b${SWITCH}\\b[^}]*\\} from`), `${file} must not import ${SWITCH} from another module`)

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    const name = statement.name.text
    if (!exported || !GATED_NAME.test(name)) continue
    const first = statement.body.statements[0]
    assert.ok(first && ts.isIfStatement(first), `${file}: ${name} must start with the ${SWITCH} check`)
    const condition = firstConditionOf(first.expression)
    assert.equal(
      condition.getText(source),
      `!${SWITCH}`,
      `${file}: ${name} must test !${SWITCH} first, so a production build drops the rest of its body`,
    )
    gated += 1
  }
}
assert.ok(gated >= 15, `expected the mock getters to be found (found ${gated})`)

const mocks = readFileSync('src/testing/e2eMocks.ts', 'utf8')
assert.match(
  mocks,
  /export function isE2EModeEnabled\(\) \{\s+if \(!E2E_MODE_COMPILED_IN\) return false\s+return hasE2EQueryParam\(\)/,
  'the runtime gate must still refuse outside dev/test builds',
)

const adminUsers = readFileSync('src/testing/adminUsersE2e.ts', 'utf8')
assert.match(adminUsers, /^function createInitialUsers\(\): AdminManagedUser\[\] \{/m, 'the admin user fixtures must be built by a function')
assert.match(adminUsers, /runtimeUsersCache \?\?= getInitialUsers\(\)\.map\(/, 'the mutable admin user list must be created on first use')
assert.doesNotMatch(adminUsers, /^(const|let) \w+(: [^=\n]+)? = \[\s*$/m, 'no fixture array may be built at module load in adminUsersE2e')

console.log(`PASS e2e mock fixtures are strippable from the production bundle (${gated} gated functions)`)
