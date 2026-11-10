import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const serviceSource = readFileSync('src/services/notificationQuietHours.ts', 'utf8')
const compiled = ts.transpileModule(serviceSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const service = { exports: {} }
vm.runInNewContext(compiled, { module: service, exports: service.exports, require })

const listeners = {}
const shown = []
const worker = vm.createContext({
  Date,
  URL,
  setTimeout,
  clearTimeout,
  self: {
    addEventListener: (type, handler) => { listeners[type] = handler },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }) } },
  },
})
vm.runInContext(readFileSync('public/push-sw.js', 'utf8'), worker)

const night = { enabled: true, start: '22:00', end: '07:00' }
const daytime = { enabled: true, start: '09:00', end: '17:00' }
const at = (hours, minutes) => new Date(2026, 8, 8, hours, minutes)
const cases = [
  [night, at(21, 59), false],
  [night, at(22, 0), true],
  [night, at(23, 59), true],
  [night, at(0, 0), true],
  [night, at(6, 59), true],
  [night, at(7, 0), false],
  [{ ...night, enabled: false }, at(23, 0), false],
  [daytime, at(8, 59), false],
  [daytime, at(9, 0), true],
  [daytime, at(16, 59), true],
  [daytime, at(17, 0), false],
  [{ ...night, start: '00:00', end: '09:00' }, at(0, 0), true],
  [{ ...night, start: '23:00', end: '08:00' }, at(8, 0), false],
  [{ ...night, start: '07:00' }, at(7, 0), false],
  [{ ...night, start: '24:00' }, at(23, 0), false],
  [{ ...night, end: '07:60' }, at(23, 0), false],
  [{ ...night, end: null }, at(23, 0), false],
  [null, at(23, 0), false],
  [night, new Date('invalid'), false],
]

for (const [value, date, expected] of cases) {
  assert.equal(service.exports.isNotificationQuietHoursActive(value, date), expected)
  assert.equal(worker.isNotificationQuietHoursActive(value, date), expected)
}

// The real push handler should not hide notifications in quiet hours; it only adds a sound/vibration option.
worker.Date = class extends Date { constructor() { super(2026, 8, 8, 23, 0) } }
for (const [settings, expectedSilent] of [[night, true], [{ ...night, enabled: false }, undefined], [null, undefined]]) {
  worker.readNotificationQuietHours = async () => settings
  let completion
  listeners.push({
    data: { json: () => ({ title: 'Yeni bölüm', body: '85. bölüm yayında.', url: '/oku/seri/85' }) },
    waitUntil: (promise) => { completion = promise },
  })
  await completion
  assert.equal(shown.at(-1).options.silent, expectedSilent)
  assert.equal(shown.at(-1).options.body, '85. bölüm yayında.')
  assert.equal(shown.at(-1).options.data.url, '/oku/seri/85')
  assert.equal(shown.at(-1).options.vibrate, undefined)
}
assert.equal(shown.length, 3, 'quiet hours must not prevent a notification from showing.')

console.log('PASS device quiet hours: local time limits, midnight and real push options')
