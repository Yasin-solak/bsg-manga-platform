import fs from 'node:fs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv } from './lib/project-env.mjs'

// For the Free plan's event limit, connections spread evenly over three private rooms.
// This tool does not measure UI render time or unique user capacity.
const args = Object.fromEntries(process.argv.slice(2).map(v => v.replace(/^--/, '').split('=')))
assert.ok(args.state && args.output)
const fixture = JSON.parse(fs.readFileSync(args.state, 'utf8'))
assert.equal(fixture.testOnly, true)
assert.equal(args['confirm-live'], fixture.project)
assert.equal(fixture.rooms.length, 3)
loadProjectEnv({ cwd: process.cwd() })
const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY
assert.equal(new URL(url).hostname, `${fixture.project}.supabase.co`)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const counts = (args.counts || '50,100,150').split(',').map(Number)
assert.ok(counts.length <= 3 && counts.every(n => Number.isInteger(n) && n > 0 && n <= 150))
const stats = values => {
  const a = [...values].sort((x, y) => x - y)
  const at = p => Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0)
  return { count: a.length, p50_ms: at(.5), p95_ms: at(.95), max_ms: at(1) }
}
const clientFor = actor => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: `Bearer ${actor.token}` } },
})
const sender = clientFor(fixture.actors[0]), sockets = [], samples = [], errors = []
const readQueue = [], rpcTimes = {}, queueTimes = [], start = Date.now()
let batch = null, closing = false, activeReads = 0, bytes = 0, reconnectVerified = 0
async function rpc(client, endpoint, action, payload) {
  const began = performance.now()
  const { data, error } = await client.rpc(`community_v2_${endpoint}`, { p_action: action, p_payload: payload }).abortSignal(AbortSignal.timeout(8000))
  ;(rpcTimes[`${endpoint}.${action}`] ??= []).push(performance.now() - began)
  if (error) throw Error(`${endpoint}.${action}: ${error.code || error.status || 'network'}`)
  bytes += Buffer.byteLength(JSON.stringify(data))
  if (bytes > 100 * 1024 * 1024) throw Error('100 MiB Realtime doğrulama bütçesi aşıldı')
  return data
}
function pump() {
  while (activeReads < 16 && readQueue.length && !closing) {
    const job = readQueue.shift(); activeReads++
    queueTimes.push(performance.now() - job.enqueued)
    void job.run().catch(e => errors.push(e.message)).finally(() => { activeReads--; pump() })
  }
}
function enqueue(run) { readQueue.push({ run, enqueued: performance.now() }); pump() }
async function subscribePart(socket, kind) {
  const topic = kind === 'channel' ? socket.channelId : socket.room.id
  await new Promise((resolve, reject) => {
    let ready = false
    const deadline = setTimeout(() => reject(Error('Özel abonelik zaman aşımı')), 12000)
    socket.client.channel(`community-v2:${kind}:${topic}`, { config: { private: true } })
      .on('broadcast', { event: 'refresh' }, event => {
        const permitted = kind === 'channel' ? ['id'] : ['id', 'scope']
        if (Object.keys(event.payload).some(k => !permitted.includes(k))) { errors.push('Sinyalde beklenmeyen içerik'); return }
        const current = batch
        if (!current) return
        if (socket.room.id !== current.room.id || (kind === 'channel' && socket.channelId !== current.channelId)) {
          errors.push('Başka test odasına veya kanalına sinyal ulaştı'); return
        }
        const seen = kind === 'channel' ? current.seen : current.serverSeen
        if (seen.has(socket.id)) return
        seen.add(socket.id)
        if (kind === 'channel') {
          current.signals.push(performance.now() - current.start)
          enqueue(async () => {
            const data = await rpc(socket.client, 'read', 'message_refresh', { channel_id: socket.channelId, ids: [] })
            if (!data.latest.some(row => row.id === current.messageId || row.client_id === current.clientId || row.body === current.body)) throw Error('Sinyal sonrası mesaj okunamadı')
            current.reads.push(performance.now() - current.start)
          })
        } else {
          enqueue(async () => {
            const data = await rpc(socket.client, 'read', 'activity', { server_id: socket.room.id })
            assert.equal(data.server_id, socket.room.id)
            current.serverReads++
          })
        }
      }).subscribe(state => {
        if (state === 'SUBSCRIBED') { ready = true; clearTimeout(deadline); resolve() }
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          clearTimeout(deadline)
          if (ready) errors.push(`Abonelik: ${state}`)
          else reject(Error(`Abonelik: ${state}`))
        } else if (state === 'CLOSED' && !closing && !socket.reconnecting) errors.push('Beklenmeyen bağlantı kapanması')
      })
  })
}
async function subscribe(socket) {
  await socket.client.realtime.setAuth(socket.actor.token)
  await subscribePart(socket, 'channel')
  await subscribePart(socket, 'server')
}
async function measure(room, channelId, label) {
  if (args['stop-file'] && fs.existsSync(args['stop-file'])) throw Error('Dış sağlık denetimi yükü durdurdu')
  assert.equal(errors.length, 0, errors[0])
  const expected = sockets.filter(s => s.channelId === channelId && !s.reconnecting).length
  const serverExpected = sockets.filter(s => s.room.id === room.id && !s.reconnecting).length
  // At most about 66 events per broadcast for deliveries + server entries.
  assert.ok(expected + serverExpected + 2 <= 70)
  const current = { room, channelId, clientId: randomUUID(), body: `Okuma buluşmasının ${label} notu.`, start: performance.now(), seen: new Set(), serverSeen: new Set(), signals: [], reads: [], serverReads: 0 }
  batch = current
  const result = await rpc(sender, 'write', 'send', { channel_id: channelId, client_id: current.clientId, body: current.body })
  current.messageId = result.id
  const ack = performance.now() - current.start
  assert.equal(result.message.id, result.id)
  const until = performance.now() + 12000
  while ((current.reads.length < expected || current.serverReads < serverExpected) && performance.now() < until && !errors.length) await sleep(25)
  const sample = { label, started_at: new Date(Date.now() - (performance.now() - current.start)).toISOString(), connections: sockets.length, channel_subscribers: expected, server_subscribers: serverExpected, delivered: current.seen.size, authorized_reads: current.reads.length, server_reads: current.serverReads, ack_ms: Math.round(ack), signal: stats(current.signals), displayed_data: stats(current.reads) }
  samples.push(sample); console.log(JSON.stringify(sample))
  assert.equal(current.seen.size, expected, 'Eksik canlı sinyal')
  assert.equal(current.reads.length, expected, 'Eksik yetkili okuma')
  assert.equal(current.serverReads, serverExpected, 'Eksik sayaç okuması')
  assert.equal(errors.length, 0, errors[0])
  batch = null
  // Waits after finishing; heavy responses do not collide with the next wave.
  await sleep(1500)
}
async function wave(label, rounds) {
  for (let n = 0; n < rounds; n++) {
    const room = fixture.rooms[n % 3], channel = room.channels[Math.floor(n / 3) % 4]
    await measure(room, channel, `${label}-${n + 1}`)
    if (samples.slice(-6).filter(s => s.displayed_data.p95_ms > 3000).length >= 3) throw Error('Üç ölçümde 3 sn sınırı aşıldı; yük durduruldu')
  }
}
try {
  for (const room of fixture.rooms) {
    const data = await rpc(sender, 'read', 'server', { server_id: room.id })
    assert.equal(data.profile.kind, 'room'); assert.equal(data.profile.join_mode, 'invite')
    assert.match(data.profile.name, /performans/); assert.equal(room.channels.length, 4)
  }
  for (const count of counts) {
    while (sockets.length < count) {
      assert.equal(errors.length, 0, errors[0])
      const id = sockets.length, room = fixture.rooms[id % 3], actor = fixture.actors[id % fixture.actors.length]
      const socket = { id, room, actor, client: clientFor(actor), channelId: room.channels[Math.floor(id / 3) % 4], reconnecting: false }
      sockets.push(socket); await subscribe(socket); await sleep(200)
    }
    console.log(JSON.stringify({ subscribed: count, at: new Date().toISOString() }))
    await wave(`${count}-bağlantı`, 12)
  }
  await wave('sürekli-yük', 24)
  const reconnect = sockets.slice(0, 30), missing = new Map()
  for (const socket of reconnect) { socket.reconnecting = true; await socket.client.removeAllChannels() }
  for (const room of fixture.rooms) {
    const payload = { channel_id: room.channels[0], client_id: randomUUID(), body: 'Bağlantı kesintisinde paylaşılan okuma kulübü notu.' }
    const [first, retry] = await Promise.all([rpc(sender, 'write', 'send', payload), rpc(sender, 'write', 'send', payload)])
    assert.equal(first.id, retry.id, 'Retry produced a double message')
    missing.set(room.id, first.id); await sleep(2000)
  }
  for (const socket of reconnect) {
    await subscribe(socket); socket.reconnecting = false
    const data = await rpc(socket.client, 'read', 'message_refresh', { channel_id: socket.room.channels[0], ids: [] })
    assert.equal(data.latest.filter(m => m.id === missing.get(socket.room.id)).length, 1)
    reconnectVerified++; await sleep(200)
  }
  await wave('yeniden-bağlantı', 12)
} catch (e) { errors.push(e.message); process.exitCode = 2 }
finally {
  closing = true; batch = null; readQueue.length = 0
  await Promise.allSettled(sockets.map(s => s.client.removeAllChannels()))
  while (activeReads) await sleep(50)
  const result = { started_at: new Date(start).toISOString(), duration_ms: Date.now() - start, unique_accounts: fixture.actors.length, max_connections: sockets.length, rooms: fixture.rooms.length, subscriptions_per_connection: 2, read_concurrency_limit: 16, bytes, reconnect_verified: reconnectVerified, rpc: Object.fromEntries(Object.entries(rpcTimes).map(([k,v]) => [k,stats(v)])), generator_queue: stats(queueTimes), samples, errors }
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ completed: true, bytes, reconnectVerified, rpc: result.rpc, queue: result.generator_queue, errors }))
}
