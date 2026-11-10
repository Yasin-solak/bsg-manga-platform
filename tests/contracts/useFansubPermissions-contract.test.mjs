import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// useFansubPermissions: yetki kaynagi. Hata ya da eksik girdi yetki ACMAZ.
const hook = read('src/hooks/useFansubPermissions.ts')
assert.match(hook, /\.catch\(\(\) => \{ if \(alive\) setPermissions\(EMPTY\) \}\)/, 'empty permissions if unloadable (fail-closed)')
assert.match(hook, /if \(!fansubId \|\| !enabled\) \{\s+setPermissions\(EMPTY\)/, 'empty permissions with no fansub or session')
assert.match(hook, /return \(\) => \{ alive = false \}/, 'an old request result does not overwrite the new fansub permissions')
assert.match(hook, /const reload = useCallback\(\(\) => setNonce\(\(value\) => value \+ 1\), \[\]\)/, 'can reload when the role changes')
assert.match(hook, /getMyFansubPermissions\(fansubId\)/)

// Users: the panel page and roles panel refresh permissions when they change.
const page = read('src/pages/FansubYonetPage.tsx')
assert.match(page, /useFansubPermissions\(id, Boolean\(currentUserId\)\)/)
assert.match(page, /<FansubRolesPanel fansubId=\{id\} onChanged=\{reloadPermissions\} \/>/)
assert.match(page, /if \(loading \|\| resolvingAdminAccess \|\| permissionsLoading\)/, 'the panel does not open before permissions load')

console.log('PASS useFansubPermissions (fail-closed, yaris korumasi, tazeleme)')
