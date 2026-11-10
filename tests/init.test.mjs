import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypescript } from './load-typescript.mjs'

function setup() {
  let resolveHandshake
  let rejectHandshake
  const handshake = new Promise((resolve, reject) => {
    resolveHandshake = resolve
    rejectHandshake = reject
  })
  const listeners = {}
  const app = { rpcTransportMode: 'websocket', dataUpdateInterval: 1, connectionError: false }
  const nodes = {
    wsReconnectAttempts: 0,
    wsConnectionState: 'disconnected',
    updateWsState(state, attempts) {
      this.wsConnectionState = state
      if (attempts !== undefined)
        this.wsReconnectAttempts = attempts
    },
    updateNodeClients() {},
    updateNodeStatuses() {},
    clearNodes() {},
  }
  const client = {
    transport: false,
    closed: false,
    setTransport(value) { this.transport = value },
    ensureWebSocketConnectedWithPing: () => handshake,
    close() { this.closed = true },
    getWebSocket: () => ({ addEventListener: (event, fn) => { listeners[event] = fn } }),
  }
  const rpc = {
    getClient: () => client,
    ping: async () => 'pong',
    getNodes: async () => ({}),
    getNodesLatestStatus: async () => ({}),
    close: () => client.close(),
  }
  class RpcError extends Error {}
  const { InitManager } = loadTypescript('../src/utils/init.ts', {
    console: { error() {}, warn() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    window: {},
  }, {
    'vue': { h() {}, watch: () => () => {} },
    '@/stores/app': { useAppStore: () => app },
    '@/stores/nodes': { useNodesStore: () => nodes },
    '@/utils/api': {},
    '@/utils/rpc': { getSharedRpc: () => rpc, RpcError },
  })
  const manager = new InitManager()
  manager.useWebSocket = true
  return { manager, client, nodes, app, resolveHandshake, rejectHandshake, listeners }
}

test('InitManager selects WebSocket only after the handshake and ping complete', async () => {
  const { manager, client, app, resolveHandshake } = setup()
  const connect = manager.connectWebSocket()
  assert.equal(client.transport, false)
  await manager.poll()
  assert.equal(app.connectionError, false)
  resolveHandshake()
  await connect
  assert.equal(client.transport, true)
})

test('handshake failure keeps HTTP polling available and schedules a bounded retry', async () => {
  const { manager, client, nodes, app, rejectHandshake } = setup()
  const connect = manager.connectWebSocket()
  rejectHandshake(new Error('handshake rejected'))
  await connect
  assert.equal(client.transport, false)
  assert.equal(client.closed, true)
  assert.equal(nodes.wsReconnectAttempts, 1)
  await manager.poll()
  assert.equal(app.connectionError, false)
})

test('an established socket closing restores HTTP while reconnecting', async () => {
  const { manager, client, resolveHandshake, listeners } = setup()
  const connect = manager.connectWebSocket()
  resolveHandshake()
  await connect
  listeners.close()
  assert.equal(client.transport, false)
})

test('a handshake finishing after destruction cannot reactivate WebSocket', async () => {
  const { manager, client, resolveHandshake } = setup()
  const connect = manager.connectWebSocket()
  manager.destroy()
  resolveHandshake()
  await connect
  assert.equal(client.transport, false)
  assert.equal(client.closed, true)
})

test('slow user information does not hold up public bootstrap data', async () => {
  const { manager } = setup()
  let releaseUserInfo
  manager.fetchUserInfo = () => new Promise((resolve) => {
    releaseUserInfo = resolve
  })
  manager.fetchPublicSettings = async () => {}
  manager.fetchNodesData = async () => {}
  const bootstrap = manager.fetchBootstrapData()
  await bootstrap
  assert.equal(typeof releaseUserInfo, 'function')
  releaseUserInfo()
})
