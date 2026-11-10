import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypescript } from './load-typescript.mjs'

function setup() {
  const requests = []
  const sockets = []
  class Socket {
    static OPEN = 1
    static CLOSED = 3
    readyState = 0
    constructor() { sockets.push(this) }
    open() {
      this.readyState = 1
      this.onopen?.()
    }

    send(body) {
      const request = JSON.parse(body)
      requests.push({ transport: 'ws', ...request })
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 'pong' }) }))
    }

    close() {
      this.readyState = 3
      queueMicrotask(() => this.onclose?.())
    }
  }
  const { RpcClient } = loadTypescript('../src/utils/rpc.ts', {
    WebSocket: Socket,
    fetch: async (_url, options) => {
      const request = JSON.parse(options.body)
      requests.push({ transport: 'http', ...request })
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: request.id, result: 'pong' }) }
    },
  })
  return { client: new RpcClient({ baseUrl: 'https://example.test/api/rpc2', useWebSocket: true }), requests, sockets }
}

test('disconnected WebSocket uses HTTP immediately without creating another socket', async () => {
  const { client, sockets, requests } = setup()
  assert.equal(await client.call('rpc.ping'), 'pong')
  assert.equal(sockets.length, 0)
  assert.equal(requests[0].transport, 'http')
})

test('reads continue through HTTP while a handshake is pending, then use the verified socket', async () => {
  const { client, sockets, requests } = setup()
  client.setTransport(false)
  const handshake = client.ensureWebSocketConnectedWithPing(1000)
  assert.equal(await client.call('rpc.ping'), 'pong')
  assert.equal(requests[0].transport, 'http')
  sockets[0].open()
  await handshake
  client.setTransport(true)
  assert.equal(await client.call('rpc.ping'), 'pong')
  assert.equal(requests.at(-1).transport, 'ws')
  client.close()
})

test('a closed verified socket falls back to HTTP on the next read', async () => {
  const { client, sockets, requests } = setup()
  const handshake = client.ensureWebSocketConnectedWithPing(1000)
  sockets[0].open()
  await handshake
  sockets[0].close()
  await Promise.resolve()
  assert.equal(await client.call('rpc.ping'), 'pong')
  assert.equal(requests.at(-1).transport, 'http')
})

test('a stalled handshake times out without blocking HTTP reads', async () => {
  const { client, requests } = setup()
  await assert.rejects(client.ensureWebSocketConnectedWithPing(10), /timeout|closed before opening/)
  assert.equal(await client.call('rpc.ping'), 'pong')
  assert.equal(requests.at(-1).transport, 'http')
})
