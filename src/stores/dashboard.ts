import type {
  PingMetricStatsResponse,
  PublicPingTask,
} from '@/utils/rpc'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSharedRpc, RpcError } from '@/utils/rpc'

/** 看板查询的历史范围。与 Komari 后台看板保持一致。 */
export const DASHBOARD_HISTORY_HOURS = 24

function getErrorMessage(error: unknown): string {
  if (error instanceof RpcError)
    return error.message
  if (error instanceof Error)
    return error.message
  return String(error)
}

export const useDashboardStore = defineStore('dashboard', () => {
  const pingStats = ref<PingMetricStatsResponse | null>(null)
  const pingTasks = ref<PublicPingTask[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastUpdated = ref<Date | null>(null)
  let requestId = 0

  const hasData = computed(() => pingStats.value !== null)

  async function refresh(): Promise<void> {
    if (loading.value)
      return

    loading.value = true
    error.value = null
    const currentRequestId = ++requestId

    const rpc = getSharedRpc()
    const [pingStatsResult, pingTasksResult] = await Promise.allSettled([
      rpc.getPingMetricStats({ hours: DASHBOARD_HISTORY_HOURS }),
      rpc.getPublicPingTasks(),
    ])

    if (currentRequestId !== requestId)
      return

    const failures: string[] = []

    if (pingStatsResult.status === 'fulfilled') {
      pingStats.value = pingStatsResult.value
      lastUpdated.value = new Date()
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

    if (failures.length > 0) {
      error.value = hasData.value
        ? '部分看板数据暂时不可用，已保留上一次成功数据。'
        : `看板数据暂时不可用：${failures[0]}`
    }

    loading.value = false
  }

  return {
    pingStats,
    pingTasks,
    loading,
    error,
    lastUpdated,
    hasData,
    refresh,
  }
})
