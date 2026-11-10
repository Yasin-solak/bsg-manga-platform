import fs from 'node:fs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv } from './lib/project-env.mjs'

// Multiple sockets are not a real user count. Only an authorized temporary room is used.
const args = Object.fromEntries(process.argv.slice(2).map(v => v.replace(/^--/, '').split('=')))
assert.ok(args.state && args.output)
const fixture = JSON.parse(fs.readFileSync(args.state, 'utf8'))
assert.equal(fixture.testOnly, true); assert.equal(args['confirm-live'], fixture.project)
loadProjectEnv({ cwd: process.cwd() })
const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY
assert.equal(new URL(url).hostname, `${fixture.project}.supabase.co`)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const clientFor = actor => createClient(url, key, { ...options, global: { headers: { Authorization: `Bearer ${actor.token}` } } })
const sender = clientFor(fixture.actors[0]), sockets = [], samples = [], errors = []
const counts = (args.counts || '50,100').split(',').map(Number), includeServer = args.server === 'true'
assert.ok(counts.length <= 3 && counts.every(n => Number.isInteger(n) && n > 0 && n <= (includeServer ? 50 : 100)))
const stats = values => { const sorted = [...values].sort((a, b) => a - b), at = p => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0); return { count: sorted.length, p50_ms: at(.5), p95_ms: at(.95), max_ms: at(1) } }
async function rpc(client, endpoint, action, payload) {
  const { data, error } = await client.rpc(`community_v2_${endpoint}`, { p_action: action, p_payload: payload }).abortSignal(AbortSignal.timeout(8000))
  if (error) throw Error(`${endpoint}.${action}: ${error.code || 'network'}`)
  return data
}
const room = await rpc(sender, 'read', 'server', { server_id: fixture.servers[0] })
assert.equal(room.profile.kind, 'room'); assert.equal(room.profile.join_mode, 'invite'); assert.match(room.profile.name, /performans/)
let batch = null, closed = false, activeReads = 0
const readQueue = []
function pump() {
  while (activeReads < 8 && readQueue.length) {
    const job = readQueue.shift(); activeReads++
    void job().catch(e => errors.push(e.message)).finally(() => { activeReads--; pump() })
  }
}
async function subscribe(socket) {
  await socket.client.realtime.setAuth(socket.actor.token)
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(Error('Özel kanal abonelik zaman aşımı')), 12000)
    socket.channel = socket.client.channel(`community-v2:channel:${socket.channelId}`, { config: { private: true } })
      .on('broadcast', { event: 'refresh' }, event => {
        // Realtime transport may add an event id to an empty payload; no content can be carried.
        if (Object.keys(event.payload).some(k => k !== 'id')) { errors.push('Canlı sinyal beklenmeyen içerik taşıyor'); return }
        const current = batch
        if (!current || socket.channelId !== current.channelId || current.seen.has(socket.id)) return
        current.seen.add(socket.id); current.signals.push(performance.now() - current.start)
        readQueue.push(async () => {
          const data = await rpc(socket.client, 'read', 'message_refresh', { channel_id: socket.channelId, ids: [] })
          if (!data.latest.some(row => row.client_id === current.clientId || row.body === current.body)) throw Error('Sinyal sonrasında yetkili okumada mesaj yok')
          current.reads.push(performance.now() - current.start)
        }); pump()
      }).subscribe(state => {
        if (state === 'SUBSCRIBED') { clearTimeout(deadline); resolve() }
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') { clearTimeout(deadline); reject(Error(`Abonelik: ${state}`)) }
        else if (state === 'CLOSED' && !closed && !socket.reconnecting) errors.push('Beklenmeyen bağlantı kapanması')
      })
  })
  if (includeServer) await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(Error('Sunucu abonelik zaman aşımı')), 12000)
    socket.serverChannel = socket.client.channel(`community-v2:server:${fixture.servers[0]}`, { config: { private: true } })
      .on('broadcast', { event: 'refresh' }, event => {
        if (Object.keys(event.payload).some(k => !['id','scope'].includes(k))) { errors.push('Sunucu sinyali beklenmeyen içerik taşıyor'); return }
        if (!batch || batch.serverSeen.has(socket.id)) return
        const current = batch; current.serverSeen.add(socket.id)
        readQueue.push(async () => { await rpc(socket.client, 'read', args.activity === 'true' ? 'activity' : 'server', { server_id: fixture.servers[0] }); current.serverReads++ }); pump()
      }).subscribe(state => {
        if (state === 'SUBSCRIBED') { clearTimeout(deadline); resolve() }
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') { clearTimeout(deadline); reject(Error(`Sunucu aboneliği: ${state}`)) }
      })
  })
}
async function sendAndMeasure(channelId, label) {
  assert.equal(errors.length, 0)
  const expected = sockets.filter(s => s.channelId === channelId).length
  batch = { channelId, clientId: randomUUID(), body: `Okuma buluşmasının ${label} teslimat notu.`, start: performance.now(), seen: new Set(), serverSeen: new Set(), serverReads: 0, signals: [], reads: [] }
  const current = batch
  const result = await rpc(sender, 'write', 'send', { channel_id: channelId, client_id: current.clientId, body: current.body })
  const ack = performance.now() - current.start
  assert.equal(result.message.id, result.id)
  const until = performance.now() + 12000
  while ((current.seen.size < expected || current.reads.length < expected || (includeServer && current.serverReads < sockets.length)) && performance.now() < until && !errors.length) await sleep(50)
  samples.push({ label, connections: sockets.length, channel_subscribers: expected, delivered: current.seen.size, authorized_reads: current.reads.length, server_reads: current.serverReads, ack_ms: Math.round(ack), signal: stats(current.signals), displayed_data: stats(current.reads) })
  console.log(JSON.stringify(samples.at(-1)))
  assert.equal(current.seen.size, expected, 'Eksik canlı sinyal'); assert.equal(current.reads.length, expected, 'Eksik yetkili okuma')
  if (includeServer) assert.equal(current.serverReads, sockets.length, 'Missing server refresh')
  batch = null
  await sleep(4000)
}
try {
  for (const count of counts) {
    while (sockets.length < count) {
      const id = sockets.length, actor = fixture.actors[id % fixture.actors.length]
      const socket = { id, actor, client: clientFor(actor), channelId: fixture.channels[id % fixture.channels.length], reconnecting: false }
      sockets.push(socket); await subscribe(socket); await sleep(200)
    }
    console.log(JSON.stringify({ subscribed: count }))
    for (let n = 0; n < 8; n++) await sendAndMeasure(fixture.channels[n % 4], `${count}-${n + 1}`)
    if (samples.slice(-8).filter(s => s.displayed_data.p95_ms > 3000).length >= 3) throw Error('Aşamada en az üç kez 3 saniye aşıldı; daha yüksek yük uygulanmadı')
  }
  // History written while disconnected is completed by an authorized read after resubscribing.
  const reconnect = sockets.slice(0, 20)
  for (const socket of reconnect) { socket.reconnecting = true; await socket.client.removeAllChannels() }
  const payload = { channel_id: fixture.channels[0], client_id: randomUUID(), body: 'Bağlantı geri geldiğinde okunacak buluşma notu.' }
  const [first, retry] = await Promise.all([rpc(sender, 'write', 'send', payload), rpc(sender, 'write', 'send', payload)])
  assert.equal(first.id, retry.id, 'Retry after a lost response produced a double message')
  for (const socket of reconnect) { await subscribe(socket); socket.reconnecting = false; await sleep(200) }
  for (const socket of reconnect.filter(s => s.channelId === payload.channel_id)) {
    const data = await rpc(socket.client, 'read', 'message_refresh', { channel_id: socket.channelId, ids: [] })
    assert.equal(data.latest.filter(row => row.id === first.id).length, 1, 'The gap range is missing or repeated')
  }
  for (let n = 0; n < 4; n++) await sendAndMeasure(fixture.channels[n], `yeniden-bağlantı-${n + 1}`)
} catch (e) { errors.push(e.message); process.exitCode = 2 }
finally {
  closed = true; batch = null
  await Promise.allSettled(sockets.map(s => s.client.removeAllChannels()))
  fs.writeFileSync(args.output, JSON.stringify({ unique_accounts: fixture.actors.length, max_connections: sockets.length, channels: fixture.channels.length, server_read_action: args.activity === 'true' ? 'activity' : 'server', subscriptions_per_connection: includeServer ? 2 : 1, read_concurrency_limit: 8, samples, errors }, null, 2))
  console.log(JSON.stringify({ completed: true, samples: samples.length, errors }))
}
