<script setup lang="ts">
import type { NetworkRateHistoryPoint } from '@/stores/nodes'
import { useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { NETWORK_RATE_HISTORY_WINDOW_MS } from '@/stores/nodes'
import { formatBytesPerSecondWithConfig } from '@/utils/helper'

const props = defineProps<{
  points: readonly NetworkRateHistoryPoint[]
}>()

type RateDirection = 'up' | 'down'

interface SparklinePoint {
  x: number
  y: number
}

interface SparklineData {
  areaPath: string
  linePath: string
}

const SPARKLINE_WIDTH = 160
const SPARKLINE_PADDING_X = 2
const SPARKLINE_PADDING_TOP = 3
const SPARKLINE_BASELINE_Y = 41

const appStore = useAppStore()
const now = useNow({ interval: 1000 })

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

const recentPoints = computed(() => {
  const cutoff = now.value.getTime() - NETWORK_RATE_HISTORY_WINDOW_MS
  return props.points.filter((point) => {
    const timestamp = Date.parse(point.time)
    return Number.isFinite(timestamp) && timestamp >= cutoff
  })
})

function getRateValues(): number[] {
  return recentPoints.value.flatMap(point => [point.up, point.down])
}

function buildSparkline(direction: RateDirection, topValue: number): SparklineData {
  const graphWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING_X * 2
  const graphHeight = SPARKLINE_BASELINE_Y - SPARKLINE_PADDING_TOP
  const baselineY = SPARKLINE_BASELINE_Y
  const points: SparklinePoint[] = recentPoints.value.map((point, index) => {
    const value = direction === 'up' ? point.up : point.down
    const x = recentPoints.value.length === 1
      ? SPARKLINE_WIDTH / 2
      : SPARKLINE_PADDING_X + graphWidth / (recentPoints.value.length - 1) * index
    const normalizedValue = Math.min(Math.max(value, 0) / topValue, 1)
    const y = baselineY - normalizedValue * graphHeight
    return { x, y }
  })

  if (points.length === 0)
    return { areaPath: '', linePath: '' }

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`)
    .join(' ')
  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  const areaPath = points.length > 1 && firstPoint && lastPoint
    ? `${linePath} L ${formatSvgNumber(lastPoint.x)} ${formatSvgNumber(baselineY)} L ${formatSvgNumber(firstPoint.x)} ${formatSvgNumber(baselineY)} Z`
    : ''

  return { areaPath, linePath }
}

const topValue = computed(() => Math.max(1, ...getRateValues()) * 1.18)
const uploadSparkline = computed(() => buildSparkline('up', topValue.value))
const downloadSparkline = computed(() => buildSparkline('down', topValue.value))
const sparklineBaselinePath = `M ${SPARKLINE_PADDING_X} ${SPARKLINE_BASELINE_Y} H ${SPARKLINE_WIDTH - SPARKLINE_PADDING_X}`

const chartTitle = computed(() => {
  const lastPoint = recentPoints.value[recentPoints.value.length - 1]
  if (!lastPoint)
    return '暂无最近 30 秒网络速率数据'

  return `最近 30 秒网络速率趋势，当前上传 ${formatBytesPerSecondWithConfig(lastPoint.up, appStore.byteDecimals)}，下载 ${formatBytesPerSecondWithConfig(lastPoint.down, appStore.byteDecimals)}`
})
</script>

<template>
  <svg
    class="rate-sparkline"
    viewBox="0 0 160 42"
    preserveAspectRatio="none"
    role="img"
    :aria-label="chartTitle"
  >
    <title>{{ chartTitle }}</title>
    <path class="rate-sparkline__base" :d="sparklineBaselinePath" />
    <path
      v-if="downloadSparkline.areaPath"
      class="rate-sparkline__area rate-sparkline__area--download"
      :d="downloadSparkline.areaPath"
    />
    <path
      v-if="uploadSparkline.areaPath"
      class="rate-sparkline__area rate-sparkline__area--upload"
      :d="uploadSparkline.areaPath"
    />
    <path
      v-if="downloadSparkline.linePath"
      class="rate-sparkline__line rate-sparkline__line--download"
      :d="downloadSparkline.linePath"
    />
    <path
      v-if="uploadSparkline.linePath"
      class="rate-sparkline__line rate-sparkline__line--upload"
      :d="uploadSparkline.linePath"
    />
  </svg>
</template>

<style scoped lang="scss">
.rate-sparkline {
  display: block;
  width: 100%;
  height: 42px;
  min-width: 0;
  overflow: visible;
}

.rate-sparkline__base {
  fill: none;
  stroke: color-mix(in srgb, var(--md-sys-color-on-surface-variant) 18%, transparent);
  stroke-dasharray: 3 4;
  stroke-linecap: round;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.rate-sparkline__area {
  pointer-events: none;
}

.rate-sparkline__area--upload {
  fill: color-mix(in srgb, var(--md-chart-success) 12%, transparent);
}

.rate-sparkline__area--download {
  fill: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
}

.rate-sparkline__line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.rate-sparkline__line--upload {
  stroke: var(--md-chart-success);
}

.rate-sparkline__line--download {
  stroke: var(--md-sys-color-primary);
}
</style>
