<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useDashboardStore } from '@/stores/dashboard'
import { useNodesStore } from '@/stores/nodes'
import {
  formatBytesPerSecondWithConfig,
  formatBytesWithConfig,
  formatDateTime,
} from '@/utils/helper'
import { getRegionDisplayName } from '@/utils/regionHelper'
import { getDaysUntilExpired } from '@/utils/tagHelper'

type DashboardSection = 'time' | 'online' | 'network' | 'traffic' | 'renewal'
type Tone = 'positive' | 'warning' | 'negative' | 'empty'

const props = defineProps<{
  section: DashboardSection
}>()

// Komari 1.4.1：0.3 起进入关注区间，1.0 以上为高波动区间。
const NETWORK_VOLATILITY_ATTENTION_THRESHOLD = 0.3
const NETWORK_VOLATILITY_CRITICAL_THRESHOLD = 1

interface RegionSummary {
  key: string
  name: string
  count: number
}

interface RenewalEntry {
  uuid: string
  name: string
  expiredAt: string
  days: number
}

interface NetworkVolatilityEntry {
  uuid: string
  name: string
  taskName: string
  p99: number | null
  volatility: number
  loss: number
  valid: number
}

interface StatusSummary {
  label: string
  tone: Tone
}

const appStore = useAppStore()
const dashboardStore = useDashboardStore()
const nodesStore = useNodesStore()
const router = useRouter()
const now = useNow({ interval: 1000 })

const currentTimeLabel = computed(() => now.value.toLocaleTimeString('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}))

const currentDateLabel = computed(() => now.value.toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}))

const timezoneLabel = computed(() => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = new Intl.DateTimeFormat('zh-CN', { timeZoneName: 'longOffset' })
    .formatToParts(now.value)
    .find(part => part.type === 'timeZoneName')
    ?.value

  return [offset, timeZone].filter(Boolean).join(' · ') || '本地时间'
})

const lastUpdatedText = computed(() => dashboardStore.lastUpdated?.toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}) ?? '')

const totalNodeCount = computed(() => nodesStore.nodes.length)
const onlineNodes = computed(() => nodesStore.nodes.filter(node => node.online))
const offlineNodes = computed(() => nodesStore.nodes.filter(node => !node.online))
const onlineNodeCount = computed(() => onlineNodes.value.length)
const onlineRate = computed(() => totalNodeCount.value > 0
  ? onlineNodeCount.value / totalNodeCount.value * 100
  : 0)
const nodeDataLoading = computed(() => totalNodeCount.value === 0 && (appStore.loading || dashboardStore.loading))

const onlineRegionSummaries = computed<RegionSummary[]>(() => {
  const counts = new Map<string, number>()

  onlineNodes.value.forEach((node) => {
    const region = node.region?.trim()
    if (!region)
      return
    counts.set(region, (counts.get(region) ?? 0) + 1)
  })

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({
      key,
      name: getRegionDisplayName(key),
      count,
    }))
})

const unlabeledOnlineNodeCount = computed(() => onlineNodes.value
  .filter(node => !node.region?.trim())
  .length)

const onlineRegionCount = computed(() => onlineRegionSummaries.value.length)

const healthStatus = computed<StatusSummary>(() => {
  if (totalNodeCount.value === 0)
    return { label: '暂无节点数据', tone: 'empty' }
  if (onlineRate.value >= 95)
    return { label: '运行稳定', tone: 'positive' }
  if (onlineRate.value >= 75)
    return { label: '需要关注', tone: 'warning' }
  return { label: '在线率偏低', tone: 'negative' }
})

const networkStats = computed(() => dashboardStore.pingStats?.stats ?? [])
const averageLatency = computed<number | null>(() => {
  const values = networkStats.value
    .map(stat => stat.avg)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (values.length === 0)
    return null

  return values.reduce((sum, value) => sum + value, 0) / values.length
})

const averageLoss = computed<number | null>(() => {
  const values = networkStats.value
    .filter(stat => typeof stat.loss === 'number' && Number.isFinite(stat.loss))

  if (values.length === 0)
    return null

  const totalWeight = values.reduce((sum, stat) => sum + Math.max(1, stat.total || 0), 0)
  const weightedLoss = values.reduce((sum, stat) => sum + stat.loss * Math.max(1, stat.total || 0), 0)
  return totalWeight > 0 ? weightedLoss / totalWeight : null
})

const networkTaskCount = computed(() => new Set(networkStats.value.map(stat => stat.task_id)).size)
const networkStatsLoading = computed(() => dashboardStore.loading && !dashboardStore.hasData)
const pingTaskNames = computed(() => new Map(
  dashboardStore.pingTasks.map(task => [String(task.id), task.name]),
))

// 对齐 Komari 1.4.1 后台：只使用有有效样本的 Ping 任务，按 P99/P50 波动值降序排列。
const networkVolatilityEntries = computed<NetworkVolatilityEntry[]>(() => networkStats.value
  .filter(stat => stat.valid > 0
    && typeof stat.p99_p50_ratio === 'number'
    && Number.isFinite(stat.p99_p50_ratio))
  .map((stat) => {
    const node = nodesStore.nodes.find(item => item.uuid === stat.entity_id)
    return {
      uuid: stat.entity_id,
      name: node?.name ?? stat.entity_id.slice(0, 8),
      taskName: pingTaskNames.value.get(String(stat.task_id)) ?? `Ping ${stat.task_id}`,
      p99: typeof stat.p99 === 'number' && Number.isFinite(stat.p99) ? stat.p99 : null,
      volatility: stat.p99_p50_ratio ?? 0,
      loss: typeof stat.loss === 'number' && Number.isFinite(stat.loss) ? stat.loss : 0,
      valid: stat.valid,
    }
  })
  .sort((left, right) => right.volatility - left.volatility || right.loss - left.loss))

const networkVolatileNodeCount = computed(() => new Set(
  networkVolatilityEntries.value
    .filter(entry => entry.volatility >= NETWORK_VOLATILITY_ATTENTION_THRESHOLD)
    .map(entry => entry.uuid),
).size)

const networkCriticalNodeCount = computed(() => new Set(
  networkVolatilityEntries.value
    .filter(entry => entry.volatility > NETWORK_VOLATILITY_CRITICAL_THRESHOLD)
    .map(entry => entry.uuid),
).size)

const highestNetworkVolatility = computed(() => networkVolatilityEntries.value[0]?.volatility ?? null)

const currentSpeed = computed(() => onlineNodes.value.reduce((total, node) => ({
  up: total.up + (Number.isFinite(node.net_out) ? node.net_out : 0),
  down: total.down + (Number.isFinite(node.net_in) ? node.net_in : 0),
}), { up: 0, down: 0 }))

const networkStatus = computed<StatusSummary>(() => {
  if (totalNodeCount.value === 0 && networkStats.value.length === 0)
    return { label: '暂无网络数据', tone: 'empty' }
  if (networkStats.value.length === 0)
    return { label: '等待探测数据', tone: 'empty' }
  if (networkCriticalNodeCount.value > 0)
    return { label: `发现 ${networkCriticalNodeCount.value} 个高波动节点`, tone: 'negative' }
  if (networkVolatileNodeCount.value > 0)
    return { label: `发现 ${networkVolatileNodeCount.value} 个需关注的波动节点`, tone: 'warning' }

  const latencyOkay = averageLatency.value === null || averageLatency.value <= 100
  const lossOkay = averageLoss.value === null || averageLoss.value <= 1
  if (latencyOkay && lossOkay)
    return { label: '网络稳定', tone: 'positive' }

  const latencyPoor = averageLatency.value !== null && averageLatency.value > 200
  const lossPoor = averageLoss.value !== null && averageLoss.value > 5
  return latencyPoor || lossPoor
    ? { label: '网络异常', tone: 'negative' }
    : { label: '需要关注', tone: 'warning' }
})

const totalTraffic = computed(() => nodesStore.nodes.reduce((total, node) => ({
  up: total.up + (Number.isFinite(node.net_total_up) ? node.net_total_up : 0),
  down: total.down + (Number.isFinite(node.net_total_down) ? node.net_total_down : 0),
}), { up: 0, down: 0 }))

const trafficNodeTotals = computed(() => nodesStore.nodes
  .map(node => ({
    uuid: node.uuid,
    name: node.name,
    up: Number.isFinite(node.net_total_up) ? node.net_total_up : 0,
    down: Number.isFinite(node.net_total_down) ? node.net_total_down : 0,
  }))
  .map(node => ({ ...node, total: node.up + node.down }))
  .filter(node => node.total > 0)
  .sort((left, right) => right.total - left.total)
  .slice(0, 5))

const trafficHasData = computed(() => totalTraffic.value.up > 0
  || totalTraffic.value.down > 0
  || currentSpeed.value.up > 0
  || currentSpeed.value.down > 0)

const trafficStatus = computed<StatusSummary>(() => {
  if (totalNodeCount.value === 0)
    return { label: '暂无流量数据', tone: 'empty' }
  if (!trafficHasData.value)
    return { label: '等待流量数据', tone: 'empty' }
  return { label: '数据持续更新', tone: 'positive' }
})

function getExpirationDays(node: NodeData): number | null {
  if (!node.expired_at?.trim())
    return null

  const timestamp = new Date(node.expired_at).getTime()
  if (!Number.isFinite(timestamp))
    return null

  return getDaysUntilExpired(node.expired_at)
}

const renewalEntries = computed<RenewalEntry[]>(() => nodesStore.nodes.flatMap((node) => {
  const days = getExpirationDays(node)
  if (days === null)
    return []

  return [{
    uuid: node.uuid,
    name: node.name,
    expiredAt: node.expired_at,
    days,
  }]
}))

const expiredEntries = computed(() => renewalEntries.value
  .filter(entry => entry.days < 0)
  .sort((left, right) => left.days - right.days))

const expiringWithin7Days = computed(() => renewalEntries.value
  .filter(entry => entry.days >= 0 && entry.days <= 7)
  .sort((left, right) => left.days - right.days))

const expiringWithin30Days = computed(() => renewalEntries.value
  .filter(entry => entry.days >= 0 && entry.days <= 30)
  .sort((left, right) => left.days - right.days))

const renewalDetails = computed(() => [
  ...expiredEntries.value,
  ...expiringWithin30Days.value,
].slice(0, 8))

const renewalStatus = computed<StatusSummary>(() => {
  if (totalNodeCount.value === 0 || renewalEntries.value.length === 0)
    return { label: '暂无到期数据', tone: 'empty' }
  if (expiredEntries.value.length > 0)
    return { label: '有节点已过期', tone: 'negative' }
  if (expiringWithin7Days.value.length > 0)
    return { label: '近期需要续费', tone: 'warning' }
  return { label: '续费安排正常', tone: 'positive' }
})

function formatBytes(bytes: number): string {
  return formatBytesWithConfig(bytes, appStore.byteDecimals)
}

function formatBytesPerSecond(bytes: number): string {
  return formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
}

function formatLatency(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} ms`
}

function formatLoss(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)}%`
}

function formatRate(value: number): string {
  return `${Math.round(value)}%`
}

function getRenewalDaysLabel(days: number): string {
  if (days < 0)
    return `已过期 ${Math.abs(days)} 天`
  if (days === 0)
    return '今天到期'
  return `${days} 天后到期`
}

function getRenewalTone(days: number): Tone {
  if (days < 0)
    return 'negative'
  if (days <= 7)
    return 'warning'
  return 'positive'
}

function openNode(uuid: string): void {
  window.$modal.destroyAll()
  void router.push({ name: 'instance-detail', params: { id: uuid } })
}
</script>

<template>
  <section class="dashboard-dialog" :aria-busy="dashboardStore.loading">
    <div v-if="props.section === 'time'" class="dashboard-dialog__section">
      <div class="dashboard-dialog__time-hero">
        <div>
          <time class="dashboard-dialog__hero-value md-number" :datetime="now.toISOString()">
            {{ currentTimeLabel }}
          </time>
          <p class="dashboard-dialog__supporting">
            {{ currentDateLabel }} · {{ timezoneLabel }}
          </p>
        </div>
        <div class="dashboard-dialog__hero-highlight">
          <strong class="dashboard-dialog__value md-number">{{ onlineRegionCount }}</strong>
          <span>个在线区域</span>
        </div>
      </div>

      <div class="dashboard-dialog__section-heading">
        <strong>在线区域</strong>
        <span>{{ onlineNodeCount }} 个在线节点</span>
      </div>
      <div v-if="onlineRegionSummaries.length > 0" class="dashboard-dialog__list">
        <div v-for="region in onlineRegionSummaries" :key="region.key" class="dashboard-dialog__list-row">
          <span class="dashboard-dialog__list-name">
            <span class="dashboard-dialog__status-dot dashboard-tone--positive" aria-hidden="true" />
            {{ region.name }}
          </span>
          <span class="dashboard-dialog__list-meta">{{ region.count }} 个节点</span>
        </div>
        <div v-if="unlabeledOnlineNodeCount > 0" class="dashboard-dialog__list-row">
          <span class="dashboard-dialog__list-name">
            <span class="dashboard-dialog__status-dot dashboard-tone--empty" aria-hidden="true" />
            未标注区域
          </span>
          <span class="dashboard-dialog__list-meta">{{ unlabeledOnlineNodeCount }} 个节点</span>
        </div>
      </div>
      <p v-else-if="nodeDataLoading" class="dashboard-dialog__empty" role="status">
        正在读取节点区域…
      </p>
      <p v-else class="dashboard-dialog__empty">
        暂无在线区域数据
      </p>
    </div>

    <div v-else-if="props.section === 'online'" class="dashboard-dialog__section">
      <div class="dashboard-dialog__summary-line">
        <div>
          <strong class="dashboard-dialog__hero-value md-number">{{ formatRate(onlineRate) }}</strong>
          <span>在线率</span>
        </div>
        <span class="dashboard-dialog__status" :class="`dashboard-tone--${healthStatus.tone}`" role="status">
          <span class="dashboard-dialog__status-dot" aria-hidden="true" />
          {{ healthStatus.label }}
        </span>
      </div>
      <div
        class="dashboard-dialog__progress"
        role="progressbar"
        aria-label="节点在线率"
        :aria-valuenow="onlineRate"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span :style="{ width: `${onlineRate}%` }" />
      </div>
      <dl class="dashboard-dialog__stat-grid">
        <div>
          <dt>在线节点</dt>
          <dd class="dashboard-tone--positive md-number">
            {{ onlineNodeCount }}
          </dd>
        </div>
        <div>
          <dt>离线节点</dt>
          <dd :class="offlineNodes.length > 0 ? 'dashboard-tone--negative' : 'dashboard-tone--positive'" class="md-number">
            {{ offlineNodes.length }}
          </dd>
        </div>
        <div>
          <dt>节点总数</dt>
          <dd class="md-number">
            {{ totalNodeCount }}
          </dd>
        </div>
      </dl>

      <div class="dashboard-dialog__section-heading">
        <strong>{{ offlineNodes.length > 0 ? '离线节点' : '节点状态' }}</strong>
        <span>{{ offlineNodes.length > 0 ? `${offlineNodes.length} 个需要检查` : '当前全部在线' }}</span>
      </div>
      <div v-if="offlineNodes.length > 0" class="dashboard-dialog__list">
        <button
          v-for="node in offlineNodes.slice(0, 8)"
          :key="node.uuid"
          class="dashboard-dialog__list-row dashboard-dialog__list-button"
          type="button"
          @click="openNode(node.uuid)"
        >
          <span class="dashboard-dialog__list-name">
            <span class="dashboard-dialog__status-dot dashboard-tone--negative" aria-hidden="true" />
            {{ node.name }}
          </span>
          <span class="dashboard-dialog__list-meta">最后在线 {{ formatDateTime(node.time) }}</span>
        </button>
        <p v-if="offlineNodes.length > 8" class="dashboard-dialog__footnote">
          还有 {{ offlineNodes.length - 8 }} 个离线节点
        </p>
      </div>
      <p v-else-if="nodeDataLoading" class="dashboard-dialog__empty" role="status">
        正在读取节点状态…
      </p>
      <p v-else class="dashboard-dialog__empty">
        当前没有离线节点
      </p>
    </div>

    <div v-else-if="props.section === 'network'" class="dashboard-dialog__section">
      <div class="dashboard-dialog__metric-grid">
        <div class="dashboard-dialog__metric-card" :class="{ 'dashboard-dialog__metric-card--warning': networkVolatileNodeCount > 0 }">
          <span>需关注节点</span>
          <strong class="dashboard-dialog__value md-number">{{ networkVolatileNodeCount }}</strong>
        </div>
        <div class="dashboard-dialog__metric-card">
          <span>最高波动值</span>
          <strong class="dashboard-dialog__value md-number">
            {{ highestNetworkVolatility === null ? '—' : highestNetworkVolatility.toFixed(2) }}
          </strong>
        </div>
      </div>
      <p class="dashboard-dialog__status" :class="`dashboard-tone--${networkStatus.tone}`" role="status">
        <span class="dashboard-dialog__status-dot" aria-hidden="true" />
        {{ networkStatus.label }}
      </p>
      <dl class="dashboard-dialog__detail-list">
        <div class="dashboard-dialog__detail-row">
          <dt>平均延迟</dt>
          <dd class="md-number">
            {{ formatLatency(averageLatency) }}
          </dd>
        </div>
        <div class="dashboard-dialog__detail-row">
          <dt>丢包率</dt>
          <dd class="md-number">
            {{ formatLoss(averageLoss) }}
          </dd>
        </div>
        <div class="dashboard-dialog__detail-row">
          <dt>当前下行</dt>
          <dd class="dashboard-tone--positive md-number">
            {{ formatBytesPerSecond(currentSpeed.down) }}
          </dd>
        </div>
        <div class="dashboard-dialog__detail-row">
          <dt>当前上行</dt>
          <dd class="dashboard-tone--positive md-number">
            {{ formatBytesPerSecond(currentSpeed.up) }}
          </dd>
        </div>
        <div class="dashboard-dialog__detail-row">
          <dt>探测任务</dt>
          <dd class="md-number">
            {{ networkTaskCount || '—' }}
          </dd>
        </div>
      </dl>
      <div v-if="networkVolatilityEntries.length > 0" class="dashboard-dialog__subsection">
        <div class="dashboard-dialog__section-heading">
          <strong>近 24 小时波动排行</strong>
          <span>按 P99/P50</span>
        </div>
        <div class="dashboard-dialog__list">
          <button
            v-for="entry in networkVolatilityEntries.slice(0, 8)"
            :key="`${entry.uuid}-${entry.taskName}`"
            class="dashboard-dialog__list-row dashboard-dialog__list-button"
            type="button"
            @click="openNode(entry.uuid)"
          >
            <span class="dashboard-dialog__list-name">
              <span
                class="dashboard-dialog__status-dot"
                :class="entry.volatility > NETWORK_VOLATILITY_CRITICAL_THRESHOLD
                  ? 'dashboard-tone--negative'
                  : entry.volatility >= NETWORK_VOLATILITY_ATTENTION_THRESHOLD
                    ? 'dashboard-tone--warning'
                    : 'dashboard-tone--positive'"
                aria-hidden="true"
              />
              {{ entry.name }}
              <small class="dashboard-dialog__list-subname">· {{ entry.taskName }}</small>
            </span>
            <span class="dashboard-dialog__list-meta">
              P99 {{ formatLatency(entry.p99) }} · 波动 {{ entry.volatility.toFixed(2) }} · 丢包 {{ formatLoss(entry.loss) }}
            </span>
          </button>
          <p v-if="networkVolatilityEntries.length > 8" class="dashboard-dialog__footnote">
            还有 {{ networkVolatilityEntries.length - 8 }} 条探测记录
          </p>
        </div>
      </div>
      <p v-else-if="networkStatsLoading" class="dashboard-dialog__empty" role="status">
        正在读取网络探测…
      </p>
      <p v-else-if="networkStats.length === 0" class="dashboard-dialog__empty">
        暂无网络探测数据
      </p>
      <p v-else class="dashboard-dialog__empty">
        暂无有效的延迟波动数据
      </p>
    </div>

    <div v-else-if="props.section === 'traffic'" class="dashboard-dialog__section">
      <div class="dashboard-dialog__metric-grid">
        <div class="dashboard-dialog__metric-card">
          <span>累计下行</span>
          <strong class="dashboard-dialog__value dashboard-tone--secondary md-number">{{ formatBytes(totalTraffic.down) }}</strong>
        </div>
        <div class="dashboard-dialog__metric-card">
          <span>累计上行</span>
          <strong class="dashboard-dialog__value dashboard-tone--primary md-number">{{ formatBytes(totalTraffic.up) }}</strong>
        </div>
      </div>
      <p class="dashboard-dialog__status" :class="`dashboard-tone--${trafficStatus.tone}`" role="status">
        <span class="dashboard-dialog__status-dot" aria-hidden="true" />
        {{ trafficStatus.label }}
      </p>
      <dl class="dashboard-dialog__detail-list">
        <div class="dashboard-dialog__detail-row">
          <dt>下行速率</dt>
          <dd class="dashboard-tone--secondary md-number">
            {{ formatBytesPerSecond(currentSpeed.down) }}
          </dd>
        </div>
        <div class="dashboard-dialog__detail-row">
          <dt>上行速率</dt>
          <dd class="dashboard-tone--primary md-number">
            {{ formatBytesPerSecond(currentSpeed.up) }}
          </dd>
        </div>
      </dl>
      <div v-if="trafficNodeTotals.length > 0" class="dashboard-dialog__subsection">
        <div class="dashboard-dialog__section-heading">
          <strong>流量较高节点</strong>
          <span>累计合计</span>
        </div>
        <div class="dashboard-dialog__list">
          <button
            v-for="node in trafficNodeTotals"
            :key="node.uuid"
            class="dashboard-dialog__list-row dashboard-dialog__list-button"
            type="button"
            @click="openNode(node.uuid)"
          >
            <span class="dashboard-dialog__list-name">{{ node.name }}</span>
            <span class="dashboard-dialog__list-meta">{{ formatBytes(node.total) }}</span>
          </button>
        </div>
      </div>
      <p v-else-if="nodeDataLoading" class="dashboard-dialog__empty" role="status">
        正在读取流量数据…
      </p>
      <p v-else class="dashboard-dialog__empty">
        暂无累计流量数据
      </p>
    </div>

    <div v-else class="dashboard-dialog__section">
      <div class="dashboard-dialog__metric-grid">
        <div class="dashboard-dialog__metric-card" :class="{ 'dashboard-dialog__metric-card--warning': expiringWithin7Days.length > 0 }">
          <span>7 天内到期</span>
          <strong class="dashboard-dialog__value md-number">{{ expiringWithin7Days.length }}</strong>
        </div>
        <div class="dashboard-dialog__metric-card">
          <span>30 天内到期</span>
          <strong class="dashboard-dialog__value md-number">{{ expiringWithin30Days.length }}</strong>
        </div>
      </div>
      <p class="dashboard-dialog__status" :class="`dashboard-tone--${renewalStatus.tone}`" role="status">
        <span class="dashboard-dialog__status-dot" aria-hidden="true" />
        {{ renewalStatus.label }}
      </p>
      <div class="dashboard-dialog__section-heading">
        <strong>{{ expiredEntries.length > 0 ? '到期节点' : '近期到期节点' }}</strong>
        <span>{{ renewalEntries.length }} 个有到期信息</span>
      </div>
      <div v-if="renewalDetails.length > 0" class="dashboard-dialog__list">
        <button
          v-for="entry in renewalDetails"
          :key="entry.uuid"
          class="dashboard-dialog__list-row dashboard-dialog__list-button"
          type="button"
          @click="openNode(entry.uuid)"
        >
          <span class="dashboard-dialog__list-name">
            <span class="dashboard-dialog__status-dot" :class="`dashboard-tone--${getRenewalTone(entry.days)}`" aria-hidden="true" />
            {{ entry.name }}
          </span>
          <span class="dashboard-dialog__list-meta" :class="`dashboard-tone--${getRenewalTone(entry.days)}`">
            {{ getRenewalDaysLabel(entry.days) }} · {{ formatDateTime(entry.expiredAt) }}
          </span>
        </button>
      </div>
      <p v-else-if="nodeDataLoading" class="dashboard-dialog__empty" role="status">
        正在读取到期信息…
      </p>
      <p v-else class="dashboard-dialog__empty">
        暂无可用的到期信息
      </p>
    </div>

    <p v-if="lastUpdatedText" class="dashboard-dialog__updated">
      看板数据更新于 {{ lastUpdatedText }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.dashboard-dialog,
.dashboard-dialog * {
  box-sizing: border-box;
}

.dashboard-dialog {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-body-medium-font);
}

.dashboard-dialog__section {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
}

.dashboard-dialog__time-hero,
.dashboard-dialog__summary-line {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-app-card-radius);
  padding: 16px;
  background: var(--md-sys-color-surface-container);
}

.dashboard-dialog__hero-value {
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-headline-small-size);
  font-weight: var(--md-sys-typescale-headline-small-weight);
  line-height: var(--md-sys-typescale-headline-small-line-height);
  letter-spacing: var(--md-sys-typescale-headline-small-tracking);
}

.dashboard-dialog__supporting,
.dashboard-dialog__updated {
  margin: 4px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  font-weight: var(--md-sys-typescale-body-small-weight);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
}

.dashboard-dialog__hero-highlight {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
  border-left: 1px solid var(--md-sys-color-outline-variant);
  padding-left: 16px;
}

.dashboard-dialog__value {
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-large-size);
  font-weight: var(--md-sys-typescale-title-large-weight);
  line-height: var(--md-sys-typescale-title-large-line-height);
  letter-spacing: var(--md-sys-typescale-title-large-tracking);
}

.dashboard-dialog__hero-highlight > span,
.dashboard-dialog__summary-line > div > span,
.dashboard-dialog__metric-card > span,
.dashboard-dialog__section-heading > span,
.dashboard-dialog__list-meta,
.dashboard-dialog__footnote {
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  font-weight: var(--md-sys-typescale-body-small-weight);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
}

.dashboard-dialog__summary-line > div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.dashboard-dialog__metric-grid,
.dashboard-dialog__stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dashboard-dialog__stat-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.dashboard-dialog__metric-card,
.dashboard-dialog__stat-grid > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-app-card-radius-small);
  padding: 12px;
  background: var(--md-sys-color-surface-container);
}

.dashboard-dialog__metric-card--warning .dashboard-dialog__value {
  color: var(--md-chart-warning);
}

.dashboard-dialog__stat-grid {
  margin: 0;
}

.dashboard-dialog__stat-grid dt {
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: var(--md-sys-typescale-label-medium-size);
  font-weight: var(--md-sys-typescale-label-medium-weight);
  line-height: var(--md-sys-typescale-label-medium-line-height);
  letter-spacing: var(--md-sys-typescale-label-medium-tracking);
}

.dashboard-dialog__stat-grid dd {
  margin: 0;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: var(--md-sys-typescale-title-medium-weight);
  line-height: var(--md-sys-typescale-title-medium-line-height);
}

.dashboard-dialog__progress {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--md-sys-color-surface-container-highest);
}

.dashboard-dialog__progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--md-chart-success);
}

.dashboard-dialog__status {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: var(--md-sys-typescale-label-medium-size);
  font-weight: var(--md-sys-typescale-label-medium-weight);
  line-height: var(--md-sys-typescale-label-medium-line-height);
  letter-spacing: var(--md-sys-typescale-label-medium-tracking);
}

.dashboard-dialog__status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
}

.dashboard-tone--positive {
  color: var(--md-chart-success);
}

.dashboard-tone--primary {
  color: var(--md-sys-color-primary);
}

.dashboard-tone--secondary {
  color: var(--md-sys-color-secondary);
}

.dashboard-tone--warning {
  color: var(--md-chart-warning);
}

.dashboard-tone--negative {
  color: var(--md-sys-color-error);
}

.dashboard-tone--empty {
  color: var(--md-sys-color-on-surface-variant);
}

.dashboard-dialog__section-heading {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.dashboard-dialog__section-heading strong {
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-title-medium-font);
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: var(--md-sys-typescale-title-medium-weight);
  line-height: var(--md-sys-typescale-title-medium-line-height);
  letter-spacing: var(--md-sys-typescale-title-medium-tracking);
}

.dashboard-dialog__list,
.dashboard-dialog__detail-list {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-top: 1px solid var(--md-sys-color-outline-variant);
}

.dashboard-dialog__list-row,
.dashboard-dialog__detail-row {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  padding: 8px 0;
  color: var(--md-sys-color-on-surface);
  background: transparent;
  text-align: left;
}

.dashboard-dialog__list-row:last-child,
.dashboard-dialog__detail-row:last-child {
  border-bottom: 0;
}

.dashboard-dialog__list-name {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  font-weight: var(--md-sys-typescale-body-medium-weight);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-dialog__list-subname {
  overflow: hidden;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small-size);
  font-weight: var(--md-sys-typescale-body-small-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-dialog__list-meta {
  flex: 0 0 auto;
  max-width: 58%;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-dialog__list-button {
  cursor: pointer;
  transition: background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

.dashboard-dialog__list-button:hover {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
}

.dashboard-dialog__detail-row dt {
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  font-weight: var(--md-sys-typescale-body-medium-weight);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);
}

.dashboard-dialog__detail-row dd {
  margin: 0;
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: var(--md-sys-typescale-title-medium-weight);
  line-height: var(--md-sys-typescale-title-medium-line-height);
}

.dashboard-dialog__subsection {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.dashboard-dialog__empty {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  font-weight: var(--md-sys-typescale-body-medium-weight);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);
  text-align: center;
}

.dashboard-dialog__footnote,
.dashboard-dialog__updated {
  margin: 0;
}

@media (max-width: 640px) {
  .dashboard-dialog__time-hero,
  .dashboard-dialog__summary-line {
    align-items: flex-start;
    flex-direction: column;
  }

  .dashboard-dialog__hero-highlight {
    width: 100%;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    border-left: 0;
    padding-top: 12px;
    padding-left: 0;
  }

  .dashboard-dialog__list-meta {
    max-width: 52%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-dialog__list-button {
    transition: none;
  }
}
</style>
