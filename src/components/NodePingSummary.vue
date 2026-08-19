<script setup lang="ts">
import type { NodePingHistoryPoint } from '@/stores/nodePing'
import dayjs from 'dayjs'
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodePingStore } from '@/stores/nodePing'
import { formatBytesPerSecondWithConfig } from '@/utils/helper'

type PingMetric = 'latency' | 'loss'
type PingTone = 'empty' | 'good' | 'ok' | 'warning' | 'error'

const props = withDefaults(defineProps<{
  uuid: string
  uploadSpeed?: number
  downloadSpeed?: number
  density?: 'regular' | 'compact'
}>(), {
  uploadSpeed: 0,
  downloadSpeed: 0,
  density: 'regular',
})

interface SparklinePoint {
  key: string
  x: number
  y: number
  title: string
}

interface SparklineData {
  areaPath: string
  linePath: string
  points: SparklinePoint[]
  lastPoint: SparklinePoint | null
}

const SPARKLINE_WIDTH = 96
const SPARKLINE_HEIGHT = 28
const SPARKLINE_PADDING_X = 4
const SPARKLINE_PADDING_Y = 4

const appStore = useAppStore()
const nodePingStore = useNodePingStore()

const pingStatsEnabled = computed(() => {
  if (!appStore.showNodePingStats)
    return false

  const settings = appStore.publicSettings
  if (!settings || settings.record_enabled === false)
    return false

  return settings.ping_record_preserve_time !== 0
})

const { stats, loading, error } = nodePingStore.useStats(
  () => props.uuid,
  { hours: () => 1, enabled: () => pingStatsEnabled.value },
)

function latencyTone(value: number): PingTone {
  if (value <= 60)
    return 'good'
  if (value <= 100)
    return 'ok'
  if (value <= 200)
    return 'warning'
  return 'error'
}

function lossTone(value: number): PingTone {
  if (value <= 1)
    return 'good'
  if (value <= 3)
    return 'ok'
  if (value <= 9)
    return 'warning'
  return 'error'
}

function isFiniteMetricValue(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function formatMetricValue(metric: PingMetric, value: number): string {
  if (metric === 'latency')
    return `${Math.round(value)} ms`
  return `${value.toFixed(1)}%`
}

function metricTone(metric: PingMetric, value: number): PingTone {
  return metric === 'latency' ? latencyTone(value) : lossTone(value)
}

function getEmptyTitle(metric: PingMetric) {
  if (loading.value)
    return '加载中'
  if (error.value)
    return '加载失败'
  if (!pingStatsEnabled.value)
    return '未启用记录'
  return metric === 'latency' ? '暂无延迟数据' : '暂无丢包数据'
}

function getPointTitle(point: NodePingHistoryPoint, metric: PingMetric, value: number | null) {
  const time = dayjs(point.time).format('HH:mm:ss')
  if (value === null)
    return `${time} N/A`
  return `${time} ${formatMetricValue(metric, value)}`
}

function getSparklineTop(metric: PingMetric, values: number[]): number {
  const maxValue = Math.max(...values)
  const floor = metric === 'latency' ? 220 : 10
  return Math.max(floor, maxValue * 1.18)
}

function buildSparkline(metric: PingMetric): SparklineData {
  const history = stats.value.history
  const values = history
    .map(point => point[metric])
    .filter(isFiniteMetricValue)

  if (!history.length || !values.length) {
    return {
      areaPath: '',
      linePath: '',
      points: [],
      lastPoint: null,
    }
  }

  const topValue = getSparklineTop(metric, values)
  const graphWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING_X * 2
  const graphHeight = SPARKLINE_HEIGHT - SPARKLINE_PADDING_Y * 2
  const baselineY = SPARKLINE_HEIGHT - SPARKLINE_PADDING_Y

  const points = history.flatMap((point, index) => {
    const value = point[metric]
    if (!isFiniteMetricValue(value))
      return []

    const x = history.length === 1
      ? SPARKLINE_WIDTH / 2
      : SPARKLINE_PADDING_X + graphWidth / (history.length - 1) * index
    const normalizedValue = Math.min(value / topValue, 1)
    const y = baselineY - normalizedValue * graphHeight

    return [{
      key: `${point.time}-${metric}-${index}`,
      x,
      y,
      title: getPointTitle(point, metric, value),
    }]
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`)
    .join(' ')
  const firstPoint = points[0]
  const lastPoint = points[points.length - 1] ?? null
  const areaPath = points.length > 1 && firstPoint && lastPoint
    ? `${linePath} L ${formatSvgNumber(lastPoint.x)} ${formatSvgNumber(baselineY)} L ${formatSvgNumber(firstPoint.x)} ${formatSvgNumber(baselineY)} Z`
    : ''

  return {
    areaPath,
    linePath,
    points,
    lastPoint,
  }
}

const latencySparkline = computed(() => buildSparkline('latency'))
const lossSparkline = computed(() => buildSparkline('loss'))

const latencyDisplay = computed(() => {
  if (stats.value.hasLatencyData)
    return `${Math.round(stats.value.avgLatency)} ms`
  if (loading.value)
    return '加载中'
  return '-'
})

const lossDisplay = computed(() => {
  if (stats.value.hasData)
    return `${stats.value.avgLoss.toFixed(1)}%`
  if (loading.value)
    return '加载中'
  return '-'
})

const latencyTitle = computed(() => {
  if (stats.value.hasLatencyData)
    return `平均延迟 ${Math.round(stats.value.avgLatency)} ms`
  return getEmptyTitle('latency')
})

const lossTitle = computed(() => {
  if (stats.value.hasData) {
    const volatility = stats.value.avgVolatility > 0
      ? `,平均波动 ${stats.value.avgVolatility.toFixed(2)}`
      : ''
    return `平均丢包 ${stats.value.avgLoss.toFixed(1)}%${volatility}`
  }
  return getEmptyTitle('loss')
})

function normalizeSpeed(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.max(value, 0)
}

const uploadSpeedValue = computed(() => normalizeSpeed(props.uploadSpeed))

const downloadSpeedValue = computed(() => normalizeSpeed(props.downloadSpeed))

const uploadSpeedDisplay = computed(() => {
  return formatBytesPerSecondWithConfig(uploadSpeedValue.value, appStore.byteDecimals)
})

const downloadSpeedDisplay = computed(() => {
  return formatBytesPerSecondWithConfig(downloadSpeedValue.value, appStore.byteDecimals)
})

const speedTitle = computed(() => {
  return `上传 ${uploadSpeedDisplay.value}，下载 ${downloadSpeedDisplay.value}`
})

const latencyToneClass = computed<PingTone>(() => {
  if (!stats.value.hasLatencyData)
    return 'empty'
  return metricTone('latency', stats.value.avgLatency)
})

const lossToneClass = computed<PingTone>(() => {
  if (!stats.value.hasData)
    return 'empty'
  return metricTone('loss', stats.value.avgLoss)
})
</script>

<template>
  <div class="node-ping-summary" :class="`node-ping-summary--${props.density}`">
    <section
      class="node-ping-summary__panel"
      :class="`node-ping-summary__panel--${latencyToneClass}`"
      :title="latencyTitle"
    >
      <div class="node-ping-summary__head">
        <span class="node-ping-summary__label">
          <span class="material-symbols-rounded" aria-hidden="true">speed</span>
        </span>
        <strong class="node-ping-summary__value md-number">{{ latencyDisplay }}</strong>
      </div>
      <svg
        class="node-ping-summary__sparkline"
        viewBox="0 0 96 28"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`${latencyTitle}，最近 1 小时趋势`"
      >
        <path class="node-ping-summary__sparkline-base" d="M 4 24 H 92" />
        <path
          v-if="latencySparkline.areaPath"
          class="node-ping-summary__sparkline-area"
          :d="latencySparkline.areaPath"
        />
        <path
          v-if="latencySparkline.linePath"
          class="node-ping-summary__sparkline-line"
          :d="latencySparkline.linePath"
        />
        <circle
          v-if="latencySparkline.lastPoint"
          class="node-ping-summary__sparkline-dot"
          :cx="latencySparkline.lastPoint.x"
          :cy="latencySparkline.lastPoint.y"
          r="2"
        />
        <circle
          v-for="point in latencySparkline.points"
          :key="point.key"
          class="node-ping-summary__sparkline-hit"
          :cx="point.x"
          :cy="point.y"
          r="6"
        >
          <title>{{ point.title }}</title>
        </circle>
      </svg>
    </section>

    <section
      class="node-ping-summary__panel"
      :class="`node-ping-summary__panel--${lossToneClass}`"
      :title="lossTitle"
    >
      <div class="node-ping-summary__head">
        <span class="node-ping-summary__label">
          <span class="material-symbols-rounded" aria-hidden="true">network_check</span>
        </span>
        <strong class="node-ping-summary__value md-number">{{ lossDisplay }}</strong>
      </div>
      <svg
        class="node-ping-summary__sparkline"
        viewBox="0 0 96 28"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`${lossTitle}，最近 1 小时趋势`"
      >
        <path class="node-ping-summary__sparkline-base" d="M 4 24 H 92" />
        <path
          v-if="lossSparkline.areaPath"
          class="node-ping-summary__sparkline-area"
          :d="lossSparkline.areaPath"
        />
        <path
          v-if="lossSparkline.linePath"
          class="node-ping-summary__sparkline-line"
          :d="lossSparkline.linePath"
        />
        <circle
          v-if="lossSparkline.lastPoint"
          class="node-ping-summary__sparkline-dot"
          :cx="lossSparkline.lastPoint.x"
          :cy="lossSparkline.lastPoint.y"
          r="2"
        />
        <circle
          v-for="point in lossSparkline.points"
          :key="point.key"
          class="node-ping-summary__sparkline-hit"
          :cx="point.x"
          :cy="point.y"
          r="6"
        >
          <title>{{ point.title }}</title>
        </circle>
      </svg>
    </section>

    <section
      class="node-ping-summary__panel node-ping-summary__panel--speed"
      :title="speedTitle"
    >
      <div
        class="node-ping-summary__speed-pairs"
        :aria-label="speedTitle"
      >
        <span class="node-ping-summary__speed-item node-ping-summary__speed-item--upload">
          <span class="material-symbols-rounded" aria-hidden="true">arrow_upward</span>
          <strong class="md-number">{{ uploadSpeedDisplay }}</strong>
        </span>
        <span class="node-ping-summary__speed-item node-ping-summary__speed-item--download">
          <span class="material-symbols-rounded" aria-hidden="true">arrow_downward</span>
          <strong class="md-number">{{ downloadSpeedDisplay }}</strong>
        </span>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.node-ping-summary {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.node-ping-summary__panel {
  --ping-accent-color: var(--md-sys-color-primary);
  --ping-curve-color: var(--md-sys-color-primary);

  position: relative;
  display: grid;
  min-width: 0;
  container-type: inline-size;
  gap: 6px;
  overflow: hidden;
  border-radius: 8px;
  padding: 8px 10px 7px;
  color: var(--ping-accent-color);
  background: var(--md-sys-color-surface-container-high);
  transition: background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

.node-ping-summary__panel::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--md-sys-color-on-surface);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

.node-ping-summary__panel:hover::before {
  opacity: var(--md-app-state-hover);
}

.node-ping-summary__head {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.node-ping-summary__label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;

  .material-symbols-rounded {
    display: inline-flex;
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: var(--ping-accent-color);
    background: color-mix(in srgb, var(--ping-accent-color) 12%, transparent);
    font-size: 15px;
    line-height: 1;
  }
}

.node-ping-summary__value {
  overflow: hidden;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: var(--md-sys-typescale-label-medium-size);
  font-weight: 800;
  line-height: var(--md-sys-typescale-label-medium-line-height);
  letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-ping-summary__sparkline {
  position: relative;
  display: block;
  width: 100%;
  height: 28px;
  min-width: 0;
  overflow: visible;
}

.node-ping-summary__sparkline-base {
  fill: none;
  stroke: color-mix(in srgb, var(--md-sys-color-on-surface-variant) 18%, transparent);
  stroke-dasharray: 3 4;
  stroke-linecap: round;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.node-ping-summary__sparkline-area {
  fill: color-mix(in srgb, var(--ping-curve-color) 14%, transparent);
  pointer-events: none;
}

.node-ping-summary__sparkline-line {
  fill: none;
  stroke: var(--ping-curve-color);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.node-ping-summary__sparkline-dot {
  fill: var(--ping-curve-color);
  stroke: var(--md-sys-color-surface-container-high);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.node-ping-summary__sparkline-hit {
  fill: transparent;
  stroke: transparent;
}

.node-ping-summary__speed-pairs {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 54px;
  align-content: space-between;
  gap: 5px;
}

.node-ping-summary__speed-item {
  --speed-item-color: var(--ping-accent-color);

  display: grid;
  min-width: 0;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 7px;

  .material-symbols-rounded {
    display: inline-flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: var(--speed-item-color);
    background: color-mix(in srgb, var(--speed-item-color) 12%, transparent);
    font-size: 15px;
    line-height: 1;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-label-medium-font);
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-label-medium-line-height);
    letter-spacing: var(--md-sys-typescale-label-medium-tracking);
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.node-ping-summary__speed-item--upload {
  --speed-item-color: var(--md-chart-success);
}

.node-ping-summary__speed-item--download {
  --speed-item-color: var(--md-sys-color-primary);
}

.node-ping-summary__panel--good {
  --ping-curve-color: var(--md-chart-success);
}

.node-ping-summary__panel--ok {
  --ping-curve-color: var(--md-sys-color-primary);
}

.node-ping-summary__panel--warning {
  --ping-curve-color: var(--md-chart-warning);
}

.node-ping-summary__panel--error {
  --ping-curve-color: var(--md-sys-color-error);
}

.node-ping-summary__panel--empty {
  --ping-accent-color: var(--md-sys-color-on-surface-variant);
  --ping-curve-color: var(--md-sys-color-on-surface-variant);
}

.node-ping-summary__panel--speed {
  --ping-accent-color: var(--md-sys-color-primary);
  --ping-curve-color: var(--md-sys-color-primary);
}

.node-ping-summary--compact {
  gap: 6px;
}

.node-ping-summary--compact .node-ping-summary__panel {
  gap: 4px;
  padding: 7px 8px 6px;
}

.node-ping-summary--compact .node-ping-summary__value {
  font-size: var(--md-sys-typescale-label-medium-size);
}

.node-ping-summary--compact .node-ping-summary__sparkline {
  height: 22px;
}

.node-ping-summary--compact .node-ping-summary__label .material-symbols-rounded {
  width: 18px;
  height: 18px;
  font-size: 14px;
}

.node-ping-summary--compact .node-ping-summary__speed-pairs {
  min-height: 42px;
  align-content: space-between;
  gap: 4px;
}

.node-ping-summary--compact .node-ping-summary__speed-item {
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 5px;

  .material-symbols-rounded {
    width: 18px;
    height: 18px;
    font-size: 14px;
  }

  strong {
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-label-small-line-height);
    letter-spacing: var(--md-sys-typescale-label-small-tracking);
  }
}

@media (max-width: 360px) {
  .node-ping-summary {
    gap: 5px;
  }

  .node-ping-summary__panel {
    padding-inline: 6px;
  }
}
</style>
