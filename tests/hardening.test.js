// Checks for the server hardening: bad requests can't stop the server, limits can't be dodged
// by faking a header or by sending many questions at once, and the database can recover.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import { clientIp } from '../server/clientIp.js'
import { createMinuteLimiter } from '../server/rateLimit.js'
import { createMemoryStore } from '../server/store.js'
import { eventsHandler, feedbackHandler } from '../server/usage.js'
import { aiProvider } from '../server/aiProvider.js'
import { createWebServer } from '../server/webServer.js'
import assistant from '../server/assistantEndpoint.js'

function fakeRes() {
  const res = { statusCode: 0, headers: {}, payload: null }
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (p) => { res.payload = p; return res }
  return res
}
const post = (body, headers = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })

test('on Render the visitor IP comes from the header Cloudflare sets, not a faked one', () => {
  const faked = { 'x-forwarded-for': '6.6.6.6, 1.2.3.4', 'cf-connecting-ip': '1.2.3.4' }
  assert.equal(clientIp({ headers: faked }, { RENDER: 'true' }), '1.2.3.4')
  assert.equal(clientIp({ headers: { 'true-client-ip': '1.2.3.4', 'x-forwarded-for': '6.6.6.6' } }, { RENDER: 'true' }), '1.2.3.4')
  // Missing host headers, or another host: same as before (first X-Forwarded-For), then the connection.
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' } }, { RENDER: 'true' }), '6.6.6.6')
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6' } }, {}), '6.6.6.6')
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, {}), '127.0.0.1')
  assert.equal(clientIp({ headers: {} }, {}), 'unknown')
})

test('the per-minute limiter counts each visitor separately', () => {
  const over = createMinuteLimiter()
  assert.equal(over('a', 2), false)
  assert.equal(over('a', 2), false)
  assert.equal(over('a', 2), true)
  assert.equal(over('b', 2), false)
})

test('events and ratings are rate limited per visitor', async () => {
  const store = createMemoryStore()
  const saved = { ...process.env }
  process.env.EVENTS_RATE_LIMIT = '2'
  process.env.FEEDBACK_RATE_LIMIT = '1'
  try {
    const ev = () => { const r = fakeRes(); return eventsHandler(post({ events: [{ type: 'form', key: 'start' }] }, { 'x-forwarded-for': '3.3.3.3' }), r, store).then(() => r.statusCode) }
    assert.deepEqual([await ev(), await ev(), await ev()], [202, 202, 429])
    const fb = (ip) => { const r = fakeRes(); return feedbackHandler(post({ feedback_id: 'x', rating: 5 }, { 'x-forwarded-for': ip }), r, store).then(() => r.statusCode) }
    assert.deepEqual([await fb('4.4.4.4'), await fb('4.4.4.4'), await fb('4.4.4.5')], [201, 429, 201])
    assert.equal((await store.totals())['rating:5'], 2)
  } finally { process.env = saved }
})

test('the daily AI limit holds when many questions arrive at once, and failed answers are handed back', async () => {
  const store = createMemoryStore()
  const saved = { ...process.env }
  process.env.OPENAI_API_KEY = 'test-key-not-used'
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9' // nothing listens here: each AI call fails fast
  process.env.ASSISTANT_DAILY_LIMIT = '1'
  delete process.env.ANTHROPIC_API_KEY
  try {
    const ask = (ip) => { const r = fakeRes(); return assistant(post({ message: 'What does AMI mean?' }, { 'x-forwarded-for': ip }), r, { store }).then(() => r.payload.reply.from) }
    const froms = await Promise.all(['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4'].map(ask))
    // Only one question may reach the AI service; the others answer from the guide at the limit.
    assert.equal(froms.filter((f) => f === 'field_guide_limit').length, 3)
    assert.equal(froms.filter((f) => f === 'field_guide_fallback').length, 1)
    const today = await store.daily(1)
    // The failed call gave its reservation back, so nothing counts against the site or a visitor.
    assert.equal(today.find((r) => r.key === 'ai:daily')?.count ?? 0, 0)
    assert.ok(today.filter((r) => r.key.startsWith('visitor:')).every((r) => r.count === 0))
  } finally { process.env = saved }
})

test('an AI_PROVIDER setting ignores a key that is only spaces', () => {
  assert.equal(aiProvider({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '  ' }), null)
  assert.equal(aiProvider({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '\n' }), null)
  assert.equal(aiProvider({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'x' }), 'openai')
})

const built = fs.existsSync(new URL('../dist/index.html', import.meta.url))

// fetch() would clean up the bad URL first, so send it exactly as an attacker would.
const rawGet = (port, path) => new Promise((resolve) => {
  http.get({ port, path }, (res) => { res.resume(); resolve(res.statusCode) }).on('error', () => resolve('connection error'))
})

test('a malformed URL gets a 400 and the server keeps running', { skip: !built && 'run npm run build first' }, async () => {
  const server = createWebServer().listen(0)
  const { port } = server.address()
  try {
    assert.equal(await rawGet(port, '/%E0%A4%A'), 400)
    assert.equal(await rawGet(port, '/%'), 400)
    assert.equal(await rawGet(port, '/healthz'), 200)
    assert.equal(await rawGet(port, '/'), 200)
    assert.equal(await rawGet(port, '/..%2Fdist-old%2Findex.html'), 403) // a sibling folder is outside dist/ too
  } finally { server.close() }
})
