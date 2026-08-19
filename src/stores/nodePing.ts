import type { PingRecord } from '@/utils/rpc'
import { useThrottleFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { getSharedRpc } from '@/utils/rpc'

export interface NodePingHistoryPoint {
  time: string
  latency: number | null
  loss: number | null
}

export interface NodePingPerTaskStat {
  taskId: number
  name: string
  avgLatency: number
  loss: number
}

export interface NodePingStats {
  avgLatency: number
  avgLoss: number
  avgVolatility: number
  history: NodePingHistoryPoint[]
  hasData: boolean
  hasLatencyData: boolean
  perTaskStats: NodePingPerTaskStat[]
}

export interface PingTaskInfo {
  id: number
  name: string
  interval: number
  loss: number
}

export interface PingRecordsResponse {
  count?: number
  records: PingRecord[]
  tasks?: PingTaskInfo[]
}

interface TaskRecordSummary {
  total: number
  success: number
}

const PING_STATS_HOURS = 1
const PING_REFRESH_INTERVAL_MS = 60_000
const NODE_PING_BAR_COUNT = 10
const CACHE_VERSION = 7
const CACHE_KEY_PREFIX = 'komari-theme-material:node-ping-stats'
const FULL_LOSS_EPSILON = 1e-6

function createEmptyStats(): NodePingStats {
  return {
    avgLatency: 0,
    avgLoss: 0,
    avgVolatility: 0,
    history: [],
    hasData: false,
    hasLatencyData: false,
    perTaskStats: [],
  }
}

function average(values: number[]): number {
  if (!values.length)
    return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function summarizeTaskRecords(records: PingRecord[]): Map<number, TaskRecordSummary> {
  const summaries = new Map<number, TaskRecordSummary>()

  for (const record of records) {
    const summary = summaries.get(record.task_id) ?? { total: 0, success: 0 }
    summary.total += 1
    if (record.value >= 0)
      summary.success += 1
    summaries.set(record.task_id, summary)
  }

  return summaries
}

function getIncludedTaskIds(records: PingRecord[]): Set<number> {
  const summaries = summarizeTaskRecords(records)
  return new Set(
    [...summaries.entries()]
      .filter(([, summary]) => summary.total > 0)
      .map(([taskId]) => taskId),
  )
}

// 线性插值百分位，对齐 Emerald useNodePingStats 的 getPercentile
function getPercentile(values: number[], percentile: number): number | null {
  if (!values.length)
    return null

  const sorted = [...values].sort((left, right) => left - right)
  const position = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * percentile))
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lowerValue = sorted[lowerIndex]
  const upperValue = sorted[upperIndex]

  if (lowerValue === undefined || upperValue === undefined)
    return null
  if (lowerIndex === upperIndex)
    return lowerValue

  return lowerValue + (upperValue - lowerValue) * (position - lowerIndex)
}

function getCacheKey(uuid: string, hours: number): string {
  return `${CACHE_KEY_PREFIX}:${uuid}:${hours}`
}

function isValidHistoryPoint(value: unknown): value is NodePingHistoryPoint {
  if (!value || typeof value !== 'object')
    return false

  const point = value as Record<string, unknown>
  const latency = point.latency
  const loss = point.loss

  return typeof point.time === 'string'
    && (latency === null || typeof latency === 'number')
    && (loss === null || typeof loss === 'number')
}

function isValidPerTaskStat(value: unknown): value is NodePingPerTaskStat {
  if (!value || typeof value !== 'object')
    return false

  const stat = value as Record<string, unknown>
  return typeof stat.taskId === 'number'
    && typeof stat.name === 'string'
    && typeof stat.avgLatency === 'number'
    && typeof stat.loss === 'number'
}

function isValidStatsState(value: unknown): value is NodePingStats {
  if (!value || typeof value !== 'object')
    return false

  const state = value as Record<string, unknown>
  return typeof state.avgLatency === 'number'
    && typeof state.avgLoss === 'number'
    && typeof state.avgVolatility === 'number'
    && typeof state.hasData === 'boolean'
    && typeof state.hasLatencyData === 'boolean'
    && Array.isArray(state.history)
    && state.history.every(isValidHistoryPoint)
    && Array.isArray(state.perTaskStats)
    && state.perTaskStats.every(isValidPerTaskStat)
}

function readStatsCache(uuid: string, hours: number): NodePingStats | null {
  if (typeof window === 'undefined')
    return null

  try {
    const raw = window.localStorage.getItem(getCacheKey(uuid, hours))
    if (!raw)
      return null

    const parsed = JSON.parse(raw) as { version?: number, stats?: unknown }
    if (parsed.version !== CACHE_VERSION || !isValidStatsState(parsed.stats))
      return null

    return parsed.stats
  }
  catch {
    return null
  }
}

function writeStatsCache(uuid: string, hours: number, value: NodePingStats): void {
  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(
      getCacheKey(uuid, hours),
      JSON.stringify({
        version: CACHE_VERSION,
        updatedAt: new Date().toISOString(),
        stats: value,
      }),
    )
  }
  catch {
  }
}

function buildRecordsByClient(records: PingRecord[]): Map<string, PingRecord[]> {
  const grouped = new Map<string, PingRecord[]>()

  for (const record of records) {
    if (!record.client)
      continue
    const currentRecords = grouped.get(record.client) ?? []
    currentRecords.push(record)
    grouped.set(record.client, currentRecords)
  }

  return grouped
}

function buildPingHistory(records: PingRecord[]): NodePingHistoryPoint[] {
  const sortedRecords = records
    .map((record) => {
      const timestamp = new Date(record.time).getTime()
      return { ...record, timestamp }
    })
    .filter(record => Number.isFinite(record.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp)

  if (!sortedRecords.length)
    return []

  // 以数据实际首尾跨度分桶（对齐 Emerald），而非固定 1h 回溯
  const firstTime = sortedRecords[0]?.timestamp ?? 0
  const lastTime = sortedRecords[sortedRecords.length - 1]?.timestamp ?? firstTime
  const bucketCount = Math.min(NODE_PING_BAR_COUNT, sortedRecords.length)
  const bucketSize = Math.max(1, (lastTime - firstTime) / bucketCount)

  return Array.from({ length: bucketCount }, (_, index) => {
    const startTime = firstTime + bucketSize * index
    const endTime = index === bucketCount - 1 ? lastTime + 1 : startTime + bucketSize
    const bucketRecords = sortedRecords.filter(
      record => record.timestamp >= startTime && record.timestamp < endTime,
    )
    const validLatencyRecords = bucketRecords.filter(record => record.value >= 0)
    const lostCount = bucketRecords.length - validLatencyRecords.length
    const latency = validLatencyRecords.length
      ? average(validLatencyRecords.map(record => record.value))
      : null
    const loss = bucketRecords.length
      ? lostCount / bucketRecords.length * 100
      : null

    return {
      time: new Date(startTime).toISOString(),
      latency,
      loss,
    }
  })
}

function buildStats(records: PingRecord[], tasks: PingTaskInfo[]): NodePingStats {
  const includedTaskIds = getIncludedTaskIds(records)
  if (!includedTaskIds.size)
    return createEmptyStats()

  const filteredRecords = records.filter(record => includedTaskIds.has(record.task_id))
  const history = buildPingHistory(filteredRecords)
  const taskRecords = new Map<number, PingRecord[]>()

  for (const record of filteredRecords) {
    const currentRecords = taskRecords.get(record.task_id) ?? []
    currentRecords.push(record)
    taskRecords.set(record.task_id, currentRecords)
  }

  const latencyValues: number[] = []
  const taskLossValues: number[] = []
  const volatilityValues: number[] = []

  for (const recordsByTask of taskRecords.values()) {
    const validValues = recordsByTask
      .map(record => record.value)
      .filter(value => value >= 0)

    taskLossValues.push((recordsByTask.length - validValues.length) / recordsByTask.length * 100)

    if (!validValues.length)
      continue

    latencyValues.push(average(validValues))

    // 波动率 = p99 / p50，仅在样本足够且 p50 远离 0 时计入
    if (validValues.length > 1) {
      const p50 = getPercentile(validValues, 0.5)
      const p99 = getPercentile(validValues, 0.99)
      if (isFiniteNumber(p50) && isFiniteNumber(p99) && p50 > FULL_LOSS_EPSILON)
        volatilityValues.push(p99 / p50)
    }
  }

  const historyLatencyValues = history
    .map(point => point.latency)
    .filter(isFiniteNumber)
  const historyLossValues = history
    .map(point => point.loss)
    .filter(isFiniteNumber)

  const avgLatency = latencyValues.length ? average(latencyValues) : average(historyLatencyValues)
  const avgLoss = taskLossValues.length ? average(taskLossValues) : average(historyLossValues)
  const avgVolatility = average(volatilityValues)
  const hasData = history.length > 0 || latencyValues.length > 0 || taskLossValues.length > 0
  const hasLatencyData = latencyValues.length > 0 || historyLatencyValues.length > 0

  const taskNameMap = new Map(tasks.map(task => [task.id, task.name]))
  const perTaskStats: NodePingPerTaskStat[] = Array.from(
    taskRecords.entries(),
    ([taskId, taskRecs]) => {
      const validValues = taskRecs.map(record => record.value).filter(value => value >= 0)
      const avgLatency = validValues.length ? average(validValues) : -1
      const loss = taskRecs.length
        ? (taskRecs.length - validValues.length) / taskRecs.length * 100
        : 100
      const name = taskNameMap.get(taskId) ?? `Ping ${taskId}`
      return { taskId, name, avgLatency, loss }
    },
  ).sort((a, b) => a.taskId - b.taskId)

  return {
    avgLatency,
    avgLoss,
    avgVolatility,
    history,
    hasData,
    hasLatencyData,
    perTaskStats,
  }
}

export const useNodePingStore = defineStore('nodePing', () => {
  const recordsByClient = shallowRef<Map<string, PingRecord[]>>(new Map())
  const tasks = shallowRef<PingTaskInfo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetchedAt = ref(0)
  const fetchStatus = ref<'idle' | 'success' | 'error'>('idle')
  const subscriberCount = ref(0)

  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let pendingRequest: Promise<void> | null = null

  async function fetchRecords(): Promise<void> {
    if (pendingRequest)
      return pendingRequest

    const rpc = getSharedRpc()
    loading.value = recordsByClient.value.size === 0
    error.value = null

    pendingRequest = (async () => {
      try {
        const result = await rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
          type: 'ping',
          hours: PING_STATS_HOURS,
        })

        recordsByClient.value = buildRecordsByClient(result?.records ?? [])
        tasks.value = result?.tasks ?? []
        lastFetchedAt.value = Date.now()
        fetchStatus.value = 'success'
      }
      catch (err) {
        error.value = err instanceof Error ? err.message : '获取 Ping 历史失败'
        fetchStatus.value = 'error'
      }
      finally {
        loading.value = false
        pendingRequest = null
      }
    })()

    return pendingRequest
  }

  function startRefresh() {
    if (refreshTimer)
      return

    void fetchRecords()
    refreshTimer = setInterval(() => {
      void fetchRecords()
    }, PING_REFRESH_INTERVAL_MS)
  }

  function stopRefresh() {
    if (!refreshTimer)
      return
    clearInterval(refreshTimer)
    refreshTimer = null
  }

  function retain() {
    subscriberCount.value += 1
    startRefresh()

    let released = false
    return () => {
      if (released)
        return
      released = true
      subscriberCount.value = Math.max(0, subscriberCount.value - 1)
      if (subscriberCount.value === 0)
        stopRefresh()
    }
  }

  // 节流回写 localStorage，避免多节点同时重算时密集写盘
  const persistStats = useThrottleFn(
    (uuid: string, hours: number, value: NodePingStats) => {
      writeStatsCache(uuid, hours, value)
    },
    PING_REFRESH_INTERVAL_MS,
    true,
    true,
  )

  function useStats(
    uuid: () => string,
    options?: { hours?: () => number, enabled?: () => boolean },
  ) {
    const hours = () => options?.hours?.() ?? PING_STATS_HOURS
    const enabled = () => options?.enabled?.() ?? true

    let stopRetain: (() => void) | null = null

    function releaseRetain() {
      stopRetain?.()
      stopRetain = null
    }

    watch(
      () => enabled() && uuid().trim(),
      (shouldRetain) => {
        if (shouldRetain && !stopRetain) {
          stopRetain = retain()
          return
        }

        if (!shouldRetain)
          releaseRetain()
      },
      { immediate: true },
    )

    onScopeDispose(releaseRetain)

    const stats = computed(() => {
      const nodeUuid = uuid().trim()
      if (!enabled() || !nodeUuid)
        return createEmptyStats()
      const records = recordsByClient.value.get(nodeUuid) ?? []
      if (records.length)
        return buildStats(records, tasks.value)
      // 首次加载尚未返回时，读本地缓存避免空状态闪烁
      if (hours() === PING_STATS_HOURS && fetchStatus.value === 'success')
        return createEmptyStats()
      return readStatsCache(nodeUuid, hours()) ?? createEmptyStats()
    })

    watch(stats, (value) => {
      if (!value.hasData)
        return
      const nodeUuid = uuid().trim()
      if (nodeUuid && enabled())
        persistStats(nodeUuid, hours(), value)
    })

    return {
      stats,
      loading,
      error,
      lastFetchedAt,
    }
  }

  return {
    recordsByClient,
    loading,
    error,
    lastFetchedAt,
    fetchRecords,
    useStats,
  }
})
