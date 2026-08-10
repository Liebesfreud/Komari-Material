import type { DatabaseSizeInfo } from '@/utils/api'
import type {
  PingMetricStatsResponse,
  PublicPingTask,
  QueryMetricsResponse,
} from '@/utils/rpc'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { getSharedApi } from '@/utils/api'
import { getSharedRpc, RpcError } from '@/utils/rpc'

/** 看板查询的历史范围。与 Komari 后台看板保持一致。 */
export const DASHBOARD_HISTORY_HOURS = 24

const DASHBOARD_METRICS = [
  'cpu.usage',
  'memory.used',
  'net.in.rate',
  'net.out.rate',
  'traffic.up',
  'traffic.down',
  'ping.latency_ms',
] as const

export interface DashboardTrafficSummary {
  up: number
  down: number
}

function isFiniteMetricValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function sumMetricValues(series: QueryMetricsResponse['series'], metricKey: string): number {
  return series
    .filter(item => item.metric_key === metricKey)
    .reduce((total, item) => total + item.points.reduce((sum, point) => {
      if (!isFiniteMetricValue(point.value))
        return sum
      return sum + Math.max(0, point.value)
    }, 0), 0)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof RpcError)
    return error.message
  if (error instanceof Error)
    return error.message
  return String(error)
}

export const useDashboardStore = defineStore('dashboard', () => {
  const appStore = useAppStore()
  const metrics = ref<QueryMetricsResponse | null>(null)
  const pingStats = ref<PingMetricStatsResponse | null>(null)
  const pingTasks = ref<PublicPingTask[]>([])
  const databaseSize = ref<DatabaseSizeInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastUpdated = ref<Date | null>(null)
  let requestId = 0

  const hasData = computed(() => metrics.value !== null || pingStats.value !== null)

  const trafficLast24Hours = computed<DashboardTrafficSummary>(() => {
    const series = metrics.value?.series ?? []
    return {
      up: sumMetricValues(series, 'traffic.up'),
      down: sumMetricValues(series, 'traffic.down'),
    }
  })

  async function refresh(): Promise<void> {
    if (loading.value)
      return

    loading.value = true
    error.value = null
    const currentRequestId = ++requestId

    const rpc = getSharedRpc()
    const api = getSharedApi()
    const end = new Date()
    const start = new Date(end.getTime() - DASHBOARD_HISTORY_HOURS * 60 * 60 * 1000)
    const [metricsResult, pingStatsResult, pingTasksResult] = await Promise.allSettled([
      rpc.queryMetrics({
        metric_keys: [...DASHBOARD_METRICS],
        start: start.toISOString(),
        end: end.toISOString(),
        aggregation: 'p95',
        aggregation_by_metric: {
          'traffic.up': 'sum',
          'traffic.down': 'sum',
        },
        max_points: 500,
        fill_empty: true,
      }),
      rpc.getPingMetricStats({ hours: DASHBOARD_HISTORY_HOURS }),
      rpc.getPublicPingTasks(),
    ])

    const databaseResult = appStore.isLoggedIn
      ? await Promise.allSettled([api.getDatabaseSize()]).then(result => result[0])
      : null

    if (currentRequestId !== requestId)
      return

    const failures: string[] = []

    if (metricsResult.status === 'fulfilled') {
      metrics.value = metricsResult.value
    }
    else {
      failures.push(`指标：${getErrorMessage(metricsResult.reason)}`)
    }

    if (pingStatsResult.status === 'fulfilled') {
      pingStats.value = pingStatsResult.value
    }
    else {
      failures.push(`Ping：${getErrorMessage(pingStatsResult.reason)}`)
    }

    if (pingTasksResult.status === 'fulfilled') {
      pingTasks.value = pingTasksResult.value
    }
    else {
      failures.push(`Ping 任务：${getErrorMessage(pingTasksResult.reason)}`)
    }

    if (databaseResult?.status === 'fulfilled') {
      databaseSize.value = databaseResult.value
    }
    else if (databaseResult?.status === 'rejected') {
      failures.push(`数据库：${getErrorMessage(databaseResult.reason)}`)
    }

    if (metricsResult.status === 'fulfilled' || pingStatsResult.status === 'fulfilled' || pingTasksResult.status === 'fulfilled') {
      lastUpdated.value = new Date()
    }

    if (failures.length > 0) {
      error.value = hasData.value
        ? '部分看板数据暂时不可用，已保留上一次成功数据。'
        : `看板数据暂时不可用：${failures[0]}`
    }

    loading.value = false
  }

  return {
    metrics,
    pingStats,
    pingTasks,
    databaseSize,
    loading,
    error,
    lastUpdated,
    hasData,
    trafficLast24Hours,
    refresh,
  }
})
