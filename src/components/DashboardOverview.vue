<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { useIntervalFn, useNow } from '@vueuse/core'
import { computed, h, onActivated, onDeactivated, onMounted, onUnmounted } from 'vue'
import DashboardOverviewDialog from '@/components/DashboardOverviewDialog.vue'
import { useAppStore } from '@/stores/app'
import { useDashboardStore } from '@/stores/dashboard'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesWithConfig } from '@/utils/helper'
import { getRegionDisplayName } from '@/utils/regionHelper'
import { getDaysUntilExpired } from '@/utils/tagHelper'

type DashboardSection = 'time' | 'online' | 'network' | 'traffic' | 'renewal'

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

const appStore = useAppStore()
const dashboardStore = useDashboardStore()
const nodesStore = useNodesStore()
const now = useNow({ interval: 1000 })

const currentTimeLabel = computed(() => now.value.toLocaleTimeString('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}))

const totalNodeCount = computed(() => nodesStore.nodes.length)
const onlineNodes = computed(() => nodesStore.nodes.filter(node => node.online))
const onlineNodeCount = computed(() => onlineNodes.value.length)
const onlineRate = computed(() => totalNodeCount.value > 0
  ? onlineNodeCount.value / totalNodeCount.value * 100
  : 0)
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

const onlineRegionCount = computed(() => onlineRegionSummaries.value.length)

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

const totalTraffic = computed(() => nodesStore.nodes.reduce((total, node) => ({
  up: total.up + (Number.isFinite(node.net_total_up) ? node.net_total_up : 0),
  down: total.down + (Number.isFinite(node.net_total_down) ? node.net_total_down : 0),
}), { up: 0, down: 0 }))

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

const expiringWithin7Days = computed(() => renewalEntries.value
  .filter(entry => entry.days >= 0 && entry.days <= 7)
  .sort((left, right) => left.days - right.days))

const expiringWithin30Days = computed(() => renewalEntries.value
  .filter(entry => entry.days >= 0 && entry.days <= 30)
  .sort((left, right) => left.days - right.days))

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

function formatBytes(bytes: number): string {
  return formatBytesWithConfig(bytes, appStore.byteDecimals)
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

const dialogTitles: Record<DashboardSection, string> = {
  time: '时间 & 点亮区域',
  online: '节点在线状况',
  network: '网络情况',
  traffic: '流量情况',
  renewal: '续费情况',
}

function openSectionDialog(section: DashboardSection): void {
  window.$modal.create({
    title: `${dialogTitles[section]}详情`,
    content: () => h(DashboardOverviewDialog, { section }),
    size: 'medium',
  })
}

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
    class="dashboard-overview"
    :class="{ 'dashboard-overview--comfortable': appStore.materialDensity === 'comfortable' }"
    :aria-busy="dashboardStore.loading"
  >
    <div v-if="dashboardStore.error" class="dashboard-overview__notice" role="status" aria-live="polite">
      <span class="material-symbols-rounded" aria-hidden="true">info</span>
      <div>
        <strong>看板数据提示</strong>
        <span>{{ dashboardStore.error }}</span>
      </div>
    </div>

    <div class="dashboard-overview__grid">
      <article
        id="dashboard-zone-time"
        class="md-card dashboard-zone dashboard-zone--interactive dashboard-zone--large dashboard-zone--time"
        :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
        aria-labelledby="dashboard-zone-time-title"
        @click="openSectionDialog('time')"
        @keydown.enter.prevent="openSectionDialog('time')"
        @keydown.space.prevent="openSectionDialog('time')"
      >
        <header class="dashboard-zone__header">
          <div class="dashboard-zone__title">
            <span class="material-symbols-rounded" aria-hidden="true">schedule</span>
            <h3 id="dashboard-zone-time-title">
              时间 &amp; 点亮区域
            </h3>
          </div>
        </header>

        <div class="dashboard-zone__body dashboard-zone__body--time">
          <div class="dashboard-time__clock">
            <time class="dashboard-time__value md-number" :datetime="now.toISOString()">
              {{ currentTimeLabel }}
            </time>
          </div>
          <div class="dashboard-time__regions">
            <span class="material-symbols-rounded" aria-hidden="true">public</span>
            <div>
              <strong class="dashboard-zone__large-value md-number">{{ onlineRegionCount }}</strong>
              <span>个在线区域</span>
            </div>
          </div>
        </div>
      </article>

      <article
        id="dashboard-zone-online"
        class="md-card dashboard-zone dashboard-zone--interactive dashboard-zone--large dashboard-zone--online"
        :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
        aria-labelledby="dashboard-zone-online-title"
        @click="openSectionDialog('online')"
        @keydown.enter.prevent="openSectionDialog('online')"
        @keydown.space.prevent="openSectionDialog('online')"
      >
        <header class="dashboard-zone__header">
          <div class="dashboard-zone__title">
            <span class="material-symbols-rounded" aria-hidden="true">health_and_safety</span>
            <h3 id="dashboard-zone-online-title">
              节点在线状况
            </h3>
          </div>
        </header>

        <div class="dashboard-zone__body dashboard-zone__body--online">
          <div class="dashboard-online__headline">
            <div>
              <strong class="dashboard-online__rate md-number">{{ formatRate(onlineRate) }}</strong>
              <span>在线率</span>
            </div>
          </div>
        </div>
      </article>

      <article
        id="dashboard-zone-network"
        class="md-card dashboard-zone dashboard-zone--interactive dashboard-zone--compact dashboard-zone--network"
        :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
        aria-labelledby="dashboard-zone-network-title"
        @click="openSectionDialog('network')"
        @keydown.enter.prevent="openSectionDialog('network')"
        @keydown.space.prevent="openSectionDialog('network')"
      >
        <header class="dashboard-zone__header">
          <div class="dashboard-zone__title">
            <span class="material-symbols-rounded" aria-hidden="true">wifi</span>
            <h3 id="dashboard-zone-network-title">
              网络情况
            </h3>
          </div>
        </header>

        <div class="dashboard-zone__body">
          <div class="dashboard-zone__metric-grid">
            <div class="dashboard-zone__metric">
              <strong class="dashboard-zone__metric-value md-number">{{ formatLatency(averageLatency) }}</strong>
              <span>平均延迟</span>
            </div>
            <div class="dashboard-zone__metric">
              <strong class="dashboard-zone__metric-value md-number">{{ formatLoss(averageLoss) }}</strong>
              <span>丢包率</span>
            </div>
          </div>
        </div>
      </article>

      <article
        id="dashboard-zone-traffic"
        class="md-card dashboard-zone dashboard-zone--interactive dashboard-zone--compact dashboard-zone--traffic"
        :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
        aria-labelledby="dashboard-zone-traffic-title"
        @click="openSectionDialog('traffic')"
        @keydown.enter.prevent="openSectionDialog('traffic')"
        @keydown.space.prevent="openSectionDialog('traffic')"
      >
        <header class="dashboard-zone__header">
          <div class="dashboard-zone__title">
            <span class="material-symbols-rounded" aria-hidden="true">swap_vert</span>
            <h3 id="dashboard-zone-traffic-title">
              流量情况
            </h3>
          </div>
        </header>

        <div class="dashboard-zone__body">
          <div class="dashboard-zone__metric-grid">
            <div class="dashboard-zone__metric dashboard-zone__metric--secondary">
              <strong class="dashboard-zone__metric-value md-number">{{ formatBytes(totalTraffic.down) }}</strong>
              <span>累计下行</span>
            </div>
            <div class="dashboard-zone__metric dashboard-zone__metric--primary">
              <strong class="dashboard-zone__metric-value md-number">{{ formatBytes(totalTraffic.up) }}</strong>
              <span>累计上行</span>
            </div>
          </div>
        </div>
      </article>

      <article
        id="dashboard-zone-renewal"
        class="md-card dashboard-zone dashboard-zone--interactive dashboard-zone--compact dashboard-zone--renewal"
        :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
        aria-labelledby="dashboard-zone-renewal-title"
        @click="openSectionDialog('renewal')"
        @keydown.enter.prevent="openSectionDialog('renewal')"
        @keydown.space.prevent="openSectionDialog('renewal')"
      >
        <header class="dashboard-zone__header">
          <div class="dashboard-zone__title">
            <span class="material-symbols-rounded" aria-hidden="true">event</span>
            <h3 id="dashboard-zone-renewal-title">
              续费情况
            </h3>
          </div>
        </header>

        <div class="dashboard-zone__body">
          <div class="dashboard-zone__metric-grid">
            <div class="dashboard-zone__metric" :class="{ 'dashboard-zone__metric--warning': expiringWithin7Days.length > 0 }">
              <strong class="dashboard-zone__metric-value md-number">{{ expiringWithin7Days.length }}</strong>
              <span>7 天内到期</span>
            </div>
            <div class="dashboard-zone__metric">
              <strong class="dashboard-zone__metric-value md-number">{{ expiringWithin30Days.length }}</strong>
              <span>30 天内到期</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.dashboard-overview {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: var(--md-app-grid-gap);
  padding: var(--md-app-card-padding);
}

.dashboard-overview,
.dashboard-overview * {
  box-sizing: border-box;
}

.dashboard-overview__notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-app-card-radius);
  padding: 12px 16px;
  color: var(--md-sys-color-on-secondary-container);
  background: var(--md-sys-color-secondary-container);
}

.dashboard-overview__notice > .material-symbols-rounded {
  flex: 0 0 auto;
  color: var(--md-sys-color-secondary);
  font-size: 20px;
}

.dashboard-overview__notice div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
}

.dashboard-overview__notice strong {
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: var(--md-sys-typescale-label-large-size);
}

.dashboard-overview__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--md-app-grid-gap);
  min-width: 0;
}

.dashboard-zone {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-color: var(--md-sys-color-outline-variant);
  padding: 8px var(--md-app-card-padding);
  background: var(--md-sys-color-surface-container);
}

.dashboard-zone--interactive {
  cursor: pointer;
  transition:
    border-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

.dashboard-zone--interactive:hover {
  border-color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 5%, var(--md-sys-color-surface-container));
}

.dashboard-zone--interactive:active {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, var(--md-sys-color-surface-container));
}

.dashboard-zone--interactive:focus-visible {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}

.dashboard-zone--large {
  min-height: 112px;
}

.dashboard-zone--compact {
  min-height: 100px;
}

.dashboard-zone__header {
  display: flex;
  order: 2;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  margin-top: 8px;
}

.dashboard-zone__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.dashboard-zone__title > .material-symbols-rounded {
  flex: 0 0 auto;
  color: var(--md-sys-color-primary);
  font-size: 20px;
}

.dashboard-zone__title h3 {
  margin: 0;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: var(--md-sys-typescale-label-large-weight);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  line-height: var(--md-sys-typescale-label-large-line-height);
}

.dashboard-zone__body {
  display: flex;
  min-width: 0;
  order: 1;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.dashboard-zone__body--time {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 16px;
}

.dashboard-time__clock {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.dashboard-time__value {
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-large-size);
  font-weight: var(--md-sys-typescale-title-large-weight);
  letter-spacing: var(--md-sys-typescale-title-large-tracking);
  line-height: var(--md-sys-typescale-title-large-line-height);
  white-space: nowrap;
}

.dashboard-time__regions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  border-left: 1px solid var(--md-sys-color-outline-variant);
  padding-left: 16px;
}

.dashboard-time__regions > .material-symbols-rounded {
  flex: 0 0 auto;
  color: var(--md-sys-color-secondary);
  font-size: 28px;
}

.dashboard-time__regions > div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  flex-direction: row;
  gap: 4px;
}

.dashboard-time__regions > div > span {
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
}

.dashboard-zone__large-value {
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-large-size);
  font-weight: var(--md-sys-typescale-title-large-weight);
  letter-spacing: var(--md-sys-typescale-title-large-tracking);
  line-height: var(--md-sys-typescale-title-large-line-height);
}

.dashboard-online__headline {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
  min-width: 0;
}

.dashboard-online__headline > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.dashboard-online__rate {
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-large-size);
  font-weight: var(--md-sys-typescale-title-large-weight);
  letter-spacing: var(--md-sys-typescale-title-large-tracking);
  line-height: var(--md-sys-typescale-title-large-line-height);
}

.dashboard-online__headline > div > span {
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
}

.dashboard-zone__metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.dashboard-zone__metric {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.dashboard-zone__metric > span {
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
}

.dashboard-zone--compact .dashboard-zone__body {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.dashboard-zone--compact .dashboard-zone__metric-grid {
  min-width: 0;
  flex: 1 1 auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dashboard-zone--compact .dashboard-zone__metric {
  align-items: baseline;
  flex-direction: row;
  gap: 4px;
}

.dashboard-zone--compact .dashboard-zone__metric > span {
  white-space: nowrap;
}

.dashboard-zone__metric-value {
  overflow: hidden;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-large-size);
  font-weight: var(--md-sys-typescale-title-large-weight);
  letter-spacing: var(--md-sys-typescale-title-large-tracking);
  line-height: var(--md-sys-typescale-title-large-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-zone__metric--primary .dashboard-zone__metric-value {
  color: var(--md-sys-color-primary);
}

.dashboard-zone__metric--secondary .dashboard-zone__metric-value {
  color: var(--md-sys-color-secondary);
}

.dashboard-zone__metric--warning .dashboard-zone__metric-value {
  color: var(--md-sys-color-primary);
}

@media (min-width: 640px) {
  .dashboard-overview__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-zone--large,
  .dashboard-zone--compact {
    grid-column: span 1;
  }
}

@media (min-width: 1024px) {
  .dashboard-overview__grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .dashboard-zone__body--time {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }

  .dashboard-time__regions {
    border-top: 1px solid var(--md-sys-color-outline-variant);
    border-left: 0;
    padding-top: 4px;
    padding-left: 0;
  }

  .dashboard-zone--compact .dashboard-zone__body {
    align-items: stretch;
    flex-direction: column;
    gap: 4px;
  }

  .dashboard-zone--compact .dashboard-zone__metric {
    align-items: flex-start;
    flex-direction: column;
    gap: 0;
  }
}

@media (max-width: 700px) {
  .dashboard-zone__body--time {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
  }

  .dashboard-zone--compact .dashboard-zone__body {
    align-items: stretch;
    flex-direction: column;
    gap: 4px;
  }
}

@media (max-width: 420px) {
  .dashboard-overview {
    padding: var(--md-app-card-padding);
  }

  .dashboard-zone__header {
    align-items: center;
    gap: 8px;
  }

  .dashboard-online__headline {
    gap: 8px;
  }
}

@media (max-width: 360px) {
  .dashboard-zone__body--time,
  .dashboard-zone--compact .dashboard-zone__body {
    grid-template-columns: minmax(0, 1fr);
    flex-direction: column;
    align-items: stretch;
  }

  .dashboard-time__regions {
    border-top: 1px solid var(--md-sys-color-outline-variant);
    border-left: 0;
    padding-top: 8px;
    padding-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-zone--interactive {
    transition: none;
  }
}
</style>
