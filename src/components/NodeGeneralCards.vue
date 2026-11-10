<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { useIntervalFn } from '@vueuse/core'
import { computed, defineAsyncComponent, h, onActivated, onDeactivated, onMounted, onUnmounted } from 'vue'
import RateSparkline from '@/components/RateSparkline.vue'
import { useAppStore } from '@/stores/app'
import { useDashboardStore } from '@/stores/dashboard'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'
import { getDaysUntilExpired } from '@/utils/tagHelper'

const EXPIRING_SOON_DAYS = 7
const DashboardOverviewDialog = defineAsyncComponent(() => import('@/components/DashboardOverviewDialog.vue'))
// 沿用 Komari 1.4.1 的黄色预警边界，统计需要关注的波动节点。
const NETWORK_VOLATILITY_THRESHOLD = 0.3

type DetailSection = 'renewal' | 'network' | 'speed' | 'traffic'

interface OverviewCard {
  kind: 'online' | 'traffic24' | 'renewal' | 'speed' | 'trafficTotal' | 'network'
  title: string
  icon: string
  section?: DetailSection
  traffic?: {
    down: { value: string, unit: string }
    up: { value: string, unit: string }
  }
}

const appStore = useAppStore()
const dashboardStore = useDashboardStore()
const nodesStore = useNodesStore()

const onlineNodeCount = computed(() => nodesStore.nodes.filter(node => node.online).length)
const offlineNodeCount = computed(() => nodesStore.nodes.length - onlineNodeCount.value)
const onlineStatus = computed(() => {
  if (nodesStore.nodes.length === 0)
    return '暂无节点'
  return offlineNodeCount.value === 0 ? '全部在线' : `${offlineNodeCount.value} 台离线`
})

const totalSpeed = computed(() => nodesStore.nodes
  .filter(node => node.online)
  .reduce((sum, node) => ({
    up: sum.up + (node.net_out || 0),
    down: sum.down + (node.net_in || 0),
  }), { up: 0, down: 0 }))

const totalTraffic = computed(() => nodesStore.nodes.reduce((sum, node) => ({
  up: sum.up + (node.net_total_up || 0),
  down: sum.down + (node.net_total_down || 0),
}), { up: 0, down: 0 }))

const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))

function getExpirationDays(node: NodeData): number | null {
  if (!node.expired_at?.trim() || !Number.isFinite(Date.parse(node.expired_at)))
    return null
  return getDaysUntilExpired(node.expired_at)
}

const upcomingExpirations = computed(() => nodesStore.nodes
  .flatMap((node) => {
    const days = getExpirationDays(node)
    return days === null || days < 0 ? [] : [{ node, days }]
  })
  .sort((left, right) => left.days - right.days))

const expiringNodeCount = computed(() => upcomingExpirations.value.filter(item => item.days <= EXPIRING_SOON_DAYS).length)
const nextExpirationText = computed(() => {
  const next = upcomingExpirations.value[0]
  if (next)
    return `最近到期 · ${next.days === 0 ? '今天到期' : `${next.days} 天后`}`
  if (nodesStore.nodes.length === 0)
    return '暂无节点'
  return nodesStore.nodes.some(node => getExpirationDays(node) !== null) ? '暂无待到期节点' : '未设置到期时间'
})

const networkVolatilityEntries = computed(() => (dashboardStore.pingStats?.stats ?? [])
  .filter(stat => stat.valid > 0
    && typeof stat.p99_p50_ratio === 'number'
    && Number.isFinite(stat.p99_p50_ratio))
  .map(stat => ({
    uuid: stat.entity_id,
    name: nodesStore.nodes.find(node => node.uuid === stat.entity_id)?.name ?? stat.entity_id.slice(0, 8),
    volatility: stat.p99_p50_ratio ?? 0,
    loss: typeof stat.loss === 'number' && Number.isFinite(stat.loss) ? stat.loss : 0,
  }))
  .sort((left, right) => right.volatility - left.volatility || right.loss - left.loss))

const networkVolatileNodeCount = computed(() => new Set(networkVolatilityEntries.value
  .filter(entry => entry.volatility >= NETWORK_VOLATILITY_THRESHOLD)
  .map(entry => entry.uuid)).size)
const mostVolatileNode = computed(() => networkVolatilityEntries.value.find(entry => entry.volatility >= NETWORK_VOLATILITY_THRESHOLD))
const hasNetworkStats = computed(() => networkVolatilityEntries.value.length > 0)
const networkStatValue = computed(() => {
  if (hasNetworkStats.value)
    return String(networkVolatileNodeCount.value)
  return dashboardStore.loading && dashboardStore.pingStats === null ? '…' : '—'
})
const networkStatEmptyText = computed(() => {
  if (dashboardStore.pingStats === null) {
    if (dashboardStore.loading)
      return '网络统计加载中…'
    return dashboardStore.error ? '网络统计暂不可用' : '暂无监测数据'
  }
  return hasNetworkStats.value ? '近期未发现明显波动' : '暂无有效监测数据'
})

const cards = computed<OverviewCard[]>(() => {
  const traffic24 = dashboardStore.trafficLast24Hours
  const unavailable = { value: dashboardStore.loading ? '…' : '—', unit: '' }
  return [
    { kind: 'online', title: '在线节点', icon: 'monitor_heart' },
    {
      kind: 'traffic24',
      title: '近24小时流量',
      icon: 'swap_vert',
      section: 'traffic',
      traffic: {
        down: dashboardStore.metrics === null ? unavailable : formatBytesSplit(traffic24.down, appStore.byteDecimals),
        up: dashboardStore.metrics === null ? unavailable : formatBytesSplit(traffic24.up, appStore.byteDecimals),
      },
    },
    { kind: 'renewal', title: '到期提醒', icon: 'event', section: 'renewal' },
    { kind: 'speed', title: '网络速率', icon: 'vital_signs', section: 'speed' },
    {
      kind: 'trafficTotal',
      title: '累计流量',
      icon: 'sync_alt',
      section: 'traffic',
      traffic: {
        down: formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals),
        up: formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals),
      },
    },
    { kind: 'network', title: '网络波动', icon: 'bar_chart', section: 'network' },
  ]
})

const detailTitles: Record<DetailSection, string> = {
  renewal: '即将过期节点详情',
  network: '网络波动节点详情',
  speed: '网络速率详情',
  traffic: '流量总览详情',
}

function openDetail(section: DetailSection | undefined): void {
  if (!section)
    return
  window.$modal.create({
    title: detailTitles[section],
    content: () => h(DashboardOverviewDialog, { section }),
    size: 'large',
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
  <section
    class="general-info"
    :class="{ 'general-info--comfortable': appStore.materialDensity === 'comfortable' }"
    aria-label="节点概览"
  >
    <component
      :is="card.section ? 'button' : 'article'"
      v-for="card in cards"
      :key="card.kind"
      :type="card.section ? 'button' : undefined"
      class="md-card general-card"
      :class="[
        `general-card--${card.kind}`,
        {
          'md-card--interactive': card.section,
          'md-surface-glass': hasBackgroundBlur,
          'general-card--traffic-unified': !appStore.trafficSplitColor,
        },
        cardBlurClass,
      ]"
      :aria-label="card.section ? `打开${card.title}详情` : undefined"
      :aria-haspopup="card.section ? 'dialog' : undefined"
      @click="openDetail(card.section)"
    >
      <div class="general-card__heading">
        <span class="material-symbols-rounded" aria-hidden="true">{{ card.icon }}</span>
        <span>{{ card.title }}</span>
      </div>

      <template v-if="card.kind === 'online'">
        <div class="general-card__stat md-number">
          <strong>{{ onlineNodeCount }}</strong>
          <span class="general-card__total">/ {{ nodesStore.nodes.length }}</span>
        </div>
        <div class="general-card__support">
          <span
            class="general-card__status-dot"
            :class="{
              'is-offline': offlineNodeCount > 0,
              'is-empty': nodesStore.nodes.length === 0,
            }"
            aria-hidden="true"
          />
          <span>{{ onlineStatus }}</span>
        </div>
      </template>

      <div v-else-if="card.traffic" class="general-card__traffic">
        <div class="general-card__traffic-row" role="group" aria-label="下载">
          <span class="general-card__direction general-card__direction--down">
            <span class="material-symbols-rounded" aria-hidden="true">arrow_downward</span>
            <span>下载</span>
          </span>
          <span class="general-card__amount md-number">
            <strong>{{ card.traffic.down.value }}</strong>
            <small v-if="card.traffic.down.unit">{{ card.traffic.down.unit }}</small>
          </span>
        </div>
        <div class="general-card__traffic-row" role="group" aria-label="上传">
          <span class="general-card__direction general-card__direction--up">
            <span class="material-symbols-rounded" aria-hidden="true">arrow_upward</span>
            <span>上传</span>
          </span>
          <span class="general-card__amount md-number">
            <strong>{{ card.traffic.up.value }}</strong>
            <small v-if="card.traffic.up.unit">{{ card.traffic.up.unit }}</small>
          </span>
        </div>
      </div>

      <template v-else-if="card.kind === 'renewal'">
        <div class="general-card__stat md-number">
          <strong>{{ expiringNodeCount }}</strong>
          <span class="general-card__unit">台 / {{ EXPIRING_SOON_DAYS }}天内</span>
        </div>
        <div class="general-card__support" :title="upcomingExpirations[0]?.node.name">
          <span class="material-symbols-rounded general-card__support-icon" aria-hidden="true">schedule</span>
          <span>{{ nextExpirationText }}</span>
        </div>
      </template>

      <div v-else-if="card.kind === 'speed'" class="general-card__speed">
        <div class="general-card__speed-metrics md-number">
          <span class="general-card__amount" aria-label="下载速率">
            <span class="material-symbols-rounded general-card__direction--down" aria-hidden="true">arrow_downward</span>
            <strong>{{ formattedSpeedDown.value }}</strong>
            <small>{{ formattedSpeedDown.unit }}</small>
          </span>
          <span class="general-card__amount" aria-label="上传速率">
            <span class="material-symbols-rounded general-card__direction--up" aria-hidden="true">arrow_upward</span>
            <strong>{{ formattedSpeedUp.value }}</strong>
            <small>{{ formattedSpeedUp.unit }}</small>
          </span>
        </div>
        <RateSparkline :points="nodesStore.networkRateHistory" />
      </div>

      <template v-else-if="card.kind === 'network'">
        <div class="general-card__stat md-number">
          <strong>{{ networkStatValue }}</strong>
          <span v-if="hasNetworkStats" class="general-card__unit">台需关注</span>
        </div>
        <div v-if="mostVolatileNode" class="general-card__support general-card__node" :title="mostVolatileNode.name">
          <span class="general-card__node-name">{{ mostVolatileNode.name }}</span>
          <span class="general-card__node-meta md-number">波动 {{ mostVolatileNode.volatility.toFixed(2) }}</span>
        </div>
        <div v-else class="general-card__support">
          {{ networkStatEmptyText }}
        </div>
      </template>
    </component>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/overview-layout' as overview;

.general-info {
  @include overview.cards-grid;
}

.general-card {
  @include overview.card;
  --overview-number-size: 28px;
  --overview-stat-size: 40px;
  --traffic-accent-down: var(--md-sys-color-primary);
  --traffic-accent-up: var(--md-chart-success);
  background: color-mix(in srgb, var(--md-sys-color-surface-container) 97%, var(--md-ref-seed-color));
  font: inherit;
  letter-spacing: 0;
  text-align: left;
  appearance: none;
  container: overview-card / inline-size;

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--md-sys-color-primary) 48%, transparent);
    outline-offset: 2px;
  }
}

.general-info--comfortable .general-card {
  min-height: 220px;

  @media (min-width: 1024px) {
    min-height: 152px;
  }
}

.general-card--traffic-unified {
  --traffic-accent-up: var(--md-sys-color-primary);
}

.general-card__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 16px;
  color: var(--md-sys-color-on-surface);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;

  .material-symbols-rounded {
    flex: 0 0 auto;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 28px;
  }
}

.general-card__stat {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  align-content: center;
  align-items: baseline;
  gap: 8px;
  padding-top: 6px;
}

.general-card__stat strong,
.general-card__total,
.general-card__amount strong {
  font-family: var(--md-app-number-font-family);
  font-size: var(--overview-number-size);
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}

.general-card__stat strong {
  font-size: var(--overview-stat-size);
}

.general-card__total {
  font-size: calc(var(--overview-stat-size) * 0.65);
}

.general-card__total,
.general-card__unit,
.general-card__amount small {
  color: var(--md-sys-color-on-surface-variant);
}

.general-card__unit,
.general-card__amount small {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.general-card__support {
  display: flex;
  min-width: 0;
  min-height: 26px;
  align-items: center;
  gap: 12px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
}

.general-card__status-dot {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--md-chart-success);

  &.is-offline {
    background: var(--md-sys-color-error);
  }

  &.is-empty {
    background: var(--md-sys-color-outline);
  }
}

.general-card__support-icon {
  flex: 0 0 auto;
  color: var(--md-chart-success);
  font-size: 22px;
}

.general-card__traffic {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 26px;
  padding-top: 8px;
}

.general-card__traffic-row {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 8px;
}

.general-card__direction {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 18px;
  font-weight: 600;
}

.general-card__direction--down {
  --direction-accent: var(--traffic-accent-down);
}

.general-card__direction--up {
  --direction-accent: var(--traffic-accent-up);
}

.general-card__direction .material-symbols-rounded,
.general-card__amount > .material-symbols-rounded {
  align-self: center;
  flex: 0 0 auto;
  color: var(--direction-accent);
  font-size: 26px;
}

.general-card__amount {
  display: inline-flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
}

.general-card__speed {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--overview-speed-gap, 20px);
  padding-top: 4px;

  .rate-sparkline {
    height: var(--overview-sparkline-height, 64px);
  }

  :deep(.rate-sparkline__line) {
    stroke-width: 2.4px;
  }

  :deep(.rate-sparkline__area) {
    opacity: 0.3;
  }

  :deep(.rate-sparkline__base) {
    opacity: 0;
  }
}

.general-card__speed-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;

  .general-card__amount {
    flex-wrap: nowrap;
  }

  .general-card__amount + .general-card__amount {
    justify-self: end;
  }
}

.general-card__node {
  justify-content: space-between;
}

.general-card__node-name {
  min-width: 0;
  overflow: hidden;
  color: var(--md-sys-color-on-surface);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.general-card__node-meta {
  flex: 0 0 auto;
  white-space: nowrap;
}

@container overview (max-width: 740px) {
  .general-card {
    @include overview.narrow-card;
    --overview-number-size: 26px;
    --overview-stat-size: 32px;
  }
}

@container overview-card (max-width: 220px) {
  .general-card__stat,
  .general-card__amount {
    --overview-number-size: 24px;
    --overview-stat-size: 32px;
  }

  .general-card__heading {
    gap: 10px;
    font-size: 16px;

    .material-symbols-rounded {
      font-size: 22px;
    }
  }

  .general-card__support,
  .general-card__unit,
  .general-card__amount small {
    font-size: 14px;
  }

  .general-card__support {
    gap: 8px;
  }

  .general-card__direction {
    gap: 6px;
    font-size: 14px;
  }

  .general-card__direction .material-symbols-rounded,
  .general-card__amount > .material-symbols-rounded {
    font-size: 22px;
  }

  .general-card__traffic {
    gap: 20px;
  }

  .general-card__speed-metrics {
    gap: 6px;

    .general-card__amount {
      --overview-number-size: 20px;
      gap: 3px;
    }

    small {
      font-size: 12px;
    }

    .material-symbols-rounded {
      font-size: 18px;
    }
  }

  .general-card__speed .rate-sparkline {
    height: var(--overview-sparkline-height, 52px);
  }
}

@container overview-card (max-width: 180px) {
  .general-card__stat,
  .general-card__amount {
    --overview-number-size: 20px;
    --overview-stat-size: 28px;
  }

  .general-card__heading {
    gap: 4px;
    font-size: 13px;

    .material-symbols-rounded {
      font-size: 18px;
    }
  }

  .general-card__support,
  .general-card__unit,
  .general-card__amount small {
    font-size: 12px;
  }

  .general-card__direction > span:last-child {
    display: none;
  }

  .general-card__speed-metrics {
    grid-template-columns: minmax(0, 1fr);

    .general-card__amount + .general-card__amount {
      justify-self: start;
    }
  }

  .general-card__support > span:last-child {
    text-wrap: balance;
  }
}
</style>
