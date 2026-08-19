<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { useIntervalFn } from '@vueuse/core'
import { computed, h, onActivated, onDeactivated, onMounted, onUnmounted } from 'vue'
import DashboardOverviewDialog from '@/components/DashboardOverviewDialog.vue'
import { useAppStore } from '@/stores/app'
import { useDashboardStore } from '@/stores/dashboard'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'
import { getDaysUntilExpired } from '@/utils/tagHelper'

const EXPIRING_SOON_DAYS = 7
// 沿用 Komari 1.4.1 的黄色预警边界，统计需要关注的波动节点。
const NETWORK_VOLATILITY_THRESHOLD = 0.3

interface NetworkVolatilityEntry {
  uuid: string
  name: string
  taskName: string
  latency: number | null
  volatility: number
  loss: number
  valid: number
}

const appStore = useAppStore()
const dashboardStore = useDashboardStore()
const nodesStore = useNodesStore()

const totalSpeed = computed(() => {
  const onlineNodes = nodesStore.nodes.filter(node => node.online)
  const up = onlineNodes.reduce((sum, node) => sum + (node.net_out || 0), 0)
  const down = onlineNodes.reduce((sum, node) => sum + (node.net_in || 0), 0)
  return { up, down }
})

const totalTraffic = computed(() => {
  const up = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
  const down = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
  return { up, down }
})

const onlineRegionCount = computed(() => {
  return new Set(
    nodesStore.nodes
      .filter(node => node.online && node.region !== '')
      .map(node => node.region),
  ).size
})

const onlineNodeCount = computed(() => nodesStore.nodes.filter(node => node.online).length)
const formattedTrafficUp = computed(() => formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals))
const formattedTrafficDown = computed(() => formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals))
const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))

function getExpirationDays(node: NodeData): number | null {
  if (!node.expired_at?.trim())
    return null

  const timestamp = new Date(node.expired_at).getTime()
  if (!Number.isFinite(timestamp))
    return null

  return getDaysUntilExpired(node.expired_at)
}

const expiringNodes = computed(() => nodesStore.nodes
  .flatMap((node) => {
    const days = getExpirationDays(node)
    if (days === null || days < 0 || days > EXPIRING_SOON_DAYS)
      return []
    return [{ node, days }]
  })
  .sort((left, right) => left.days - right.days))

const networkStats = computed(() => dashboardStore.pingStats?.stats ?? [])
const pingTaskNames = computed(() => new Map(
  dashboardStore.pingTasks.map(task => [String(task.id), task.name]),
))

const networkVolatilityEntries = computed<NetworkVolatilityEntry[]>(() => networkStats.value
  .filter(stat => stat.valid > 0
    && typeof stat.p99_p50_ratio === 'number'
    && Number.isFinite(stat.p99_p50_ratio))
  .map((stat) => {
    const node = nodesStore.nodes.find(item => item.uuid === stat.entity_id)
    const volatility = stat.p99_p50_ratio ?? 0
    return {
      uuid: stat.entity_id,
      name: node?.name ?? stat.entity_id.slice(0, 8),
      taskName: pingTaskNames.value.get(String(stat.task_id)) ?? `Ping ${stat.task_id}`,
      latency: typeof stat.p99 === 'number' && Number.isFinite(stat.p99)
        ? stat.p99
        : typeof stat.avg === 'number' && Number.isFinite(stat.avg) ? stat.avg : null,
      volatility,
      loss: typeof stat.loss === 'number' && Number.isFinite(stat.loss) ? stat.loss : 0,
      valid: stat.valid,
    }
  })
  .sort((left, right) => right.volatility - left.volatility || right.loss - left.loss))

const networkVolatileNodeCount = computed(() => new Set(
  networkVolatilityEntries.value
    .filter(entry => entry.volatility >= NETWORK_VOLATILITY_THRESHOLD)
    .map(entry => entry.uuid),
).size)

const networkStatValue = computed(() => {
  if (!dashboardStore.hasData)
    return dashboardStore.loading ? '…' : '—'
  return String(networkVolatileNodeCount.value)
})

const networkStatLabel = computed(() => {
  if (dashboardStore.error)
    return dashboardStore.hasData ? '网络统计暂不可用' : '网络统计加载失败'
  if (!dashboardStore.hasData)
    return '网络统计加载中'
  return '网络波动节点'
})

const networkCardAriaLabel = computed(() => `打开近期网络波动节点详情，${networkStatLabel.value}`)

type DetailSection = 'renewal' | 'network'

const detailTitles: Record<DetailSection, string> = {
  renewal: '即将过期节点详情',
  network: '网络波动节点详情',
}

function openDetail(section: DetailSection): void {
  window.$modal.create({
    title: detailTitles[section],
    content: () => h(DashboardOverviewDialog, { section }),
    size: 'medium',
  })
}

const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.cardBlurRadius > 0)
const cardBlurClass = computed(() => {
  if (!hasBackgroundBlur.value)
    return ''
  const radius = appStore.cardBlurRadius
  if (radius <= 8)
    return 'glass-8'
  if (radius <= 12)
    return 'glass-12'
  if (radius <= 16)
    return 'glass-16'
  if (radius <= 20)
    return 'glass-20'
  return `glass-${radius}`
})

const { pause: pauseRefreshTimer, resume: resumeRefreshTimer } = useIntervalFn(
  () => {
    void dashboardStore.refresh()
  },
  5 * 60 * 1000,
  { immediate: false },
)

onMounted(() => {
  void dashboardStore.refresh()
  resumeRefreshTimer()
})

onActivated(() => resumeRefreshTimer())
onDeactivated(() => pauseRefreshTimer())
onUnmounted(() => pauseRefreshTimer())
</script>

<template>
  <section class="general-info" :class="{ 'general-info--comfortable': appStore.materialDensity === 'comfortable' }">
    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__value md-number">
        {{ onlineNodeCount }}<span>/{{ nodesStore.nodes.length }}</span>
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">monitor_heart</span>
        在线节点
      </div>
    </article>

    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__value md-number">
        {{ onlineRegionCount }}
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">public</span>
        点亮区域
      </div>
    </article>

    <article
      class="md-card md-card--interactive general-card"
      :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]"
      role="button"
      tabindex="0"
      aria-haspopup="dialog"
      aria-label="打开即将过期节点详情"
      @click="openDetail('renewal')"
      @keydown.enter.prevent="openDetail('renewal')"
      @keydown.space.prevent="openDetail('renewal')"
    >
      <div class="general-card__value md-number">
        {{ expiringNodes.length }}
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">event</span>
        即将过期节点
      </div>
    </article>

    <article
      class="md-card md-card--interactive general-card"
      :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]"
      role="button"
      tabindex="0"
      aria-haspopup="dialog"
      :aria-label="networkCardAriaLabel"
      @click="openDetail('network')"
      @keydown.enter.prevent="openDetail('network')"
      @keydown.space.prevent="openDetail('network')"
    >
      <div class="general-card__value md-number">
        {{ networkStatValue }}
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">trending_up</span>
        {{ networkStatLabel }}
      </div>
    </article>

    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__metric-stack md-number">
        <div>
          <span class="material-symbols-rounded">upload</span>
          <strong>{{ formattedTrafficUp.value }}</strong>
          <small>{{ formattedTrafficUp.unit }}</small>
        </div>
        <div>
          <span class="material-symbols-rounded">download</span>
          <strong>{{ formattedTrafficDown.value }}</strong>
          <small>{{ formattedTrafficDown.unit }}</small>
        </div>
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">swap_vert</span>
        流量总览
      </div>
    </article>

    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__metric-stack md-number">
        <div>
          <span class="material-symbols-rounded">arrow_upward</span>
          <strong>{{ formattedSpeedUp.value }}</strong>
          <small>{{ formattedSpeedUp.unit }}</small>
        </div>
        <div>
          <span class="material-symbols-rounded">arrow_downward</span>
          <strong>{{ formattedSpeedDown.value }}</strong>
          <small>{{ formattedSpeedDown.unit }}</small>
        </div>
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">bolt</span>
        网络速率
      </div>
    </article>
  </section>
</template>

<style scoped lang="scss">
.general-info {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  min-width: 0;
  gap: var(--md-app-grid-gap);
  padding: 16px;

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.general-card {
  min-height: var(--md-app-row-height);
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;

  @media (min-width: 640px) {
    min-height: 132px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--md-app-card-padding);
  }
}

.general-card:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--md-sys-color-primary) 48%, transparent);
  outline-offset: 2px;
}

.general-info--comfortable .general-card {
  @media (min-width: 640px) {
    min-height: 150px;
  }
}

.general-card__value {
  min-width: 0;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-title-medium-font);
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: 800;
  line-height: var(--md-sys-typescale-title-medium-line-height);
  letter-spacing: var(--md-sys-typescale-title-medium-tracking);
  word-break: break-word;

  span {
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-label-medium-font);
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  }

  @media (min-width: 640px) {
    font-family: var(--md-sys-typescale-headline-small-font);
    font-size: var(--md-sys-typescale-headline-small-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-headline-small-line-height);
    letter-spacing: var(--md-sys-typescale-headline-small-tracking);
  }
}

.general-card__label {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: var(--md-sys-typescale-label-medium-size);
  font-weight: var(--md-sys-typescale-label-medium-weight);
  line-height: var(--md-sys-typescale-label-medium-line-height);
  letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  white-space: nowrap;
}

.general-card__metric-stack {
  display: flex;
  gap: 12px;

  @media (min-width: 640px) {
    flex-direction: column;
    gap: 6px;
  }

  div {
    display: inline-flex;
    min-width: 0;
    align-items: baseline;
    gap: 4px;
  }

  .material-symbols-rounded {
    align-self: center;
    color: var(--md-sys-color-primary);
    font-size: 16px;
  }

  strong {
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-medium-font);
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-title-medium-line-height);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);

    @media (min-width: 640px) {
      font-family: var(--md-sys-typescale-title-large-font);
      font-size: var(--md-sys-typescale-title-large-size);
      font-weight: 800;
      line-height: var(--md-sys-typescale-title-large-line-height);
      letter-spacing: var(--md-sys-typescale-title-large-tracking);
    }
  }

  small {
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: var(--md-sys-typescale-label-small-weight);
    line-height: var(--md-sys-typescale-label-small-line-height);
    letter-spacing: var(--md-sys-typescale-label-small-tracking);
    white-space: nowrap;
  }
}
</style>
