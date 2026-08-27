<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig } from '@/utils/helper'
import '@/utils/echarts'

export interface DashboardTrendPoint {
  time: string
  up: number | null
  down: number | null
}

type ValueKind = 'rate' | 'traffic'

const props = defineProps<{
  points: readonly DashboardTrendPoint[]
  valueKind: ValueKind
  chartLabel: string
  emptyText: string
}>()

interface TooltipItem {
  axisValue: number | string
  color: string
  seriesName: string
  value: [number | string, number | null]
}

const appStore = useAppStore()

const hasData = computed(() => props.points.some(point => (
  (typeof point.up === 'number' && Number.isFinite(point.up))
  || (typeof point.down === 'number' && Number.isFinite(point.down))
)))

function formatValue(value: number): string {
  return props.valueKind === 'rate'
    ? formatBytesPerSecondWithConfig(value, appStore.byteDecimals)
    : formatBytesWithConfig(value, appStore.byteDecimals)
}

function formatAxisValue(value: number): string {
  if (value <= 0)
    return '0'

  const units = props.valueKind === 'rate'
    ? ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
    : ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const normalized = value / 1024 ** unitIndex
  return `${normalized >= 10 ? normalized.toFixed(0) : normalized.toFixed(1)} ${units[unitIndex]}`
}

function formatTime(value: number | string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()))
    return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const chartTheme = computed(() => {
  const tokens = appStore.materialThemeTokens
  return {
    down: tokens.chartColors.primary,
    up: tokens.chartColors.success,
    text: tokens.colors['on-surface']!,
    muted: tokens.colors['on-surface-variant']!,
    border: tokens.colors['outline-variant']!,
    tooltip: tokens.colors['surface-container-high']!,
    split: appStore.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
  }
})

const chartOption = computed(() => ({
  animationDuration: 260,
  color: [chartTheme.value.down, chartTheme.value.up],
  textStyle: {
    fontFamily: appStore.fontFamily,
    fontSize: 13,
  },
  grid: { top: 26, right: 18, bottom: 34, left: 18, containLabel: true },
  legend: {
    top: 0,
    right: 12,
    itemWidth: 16,
    itemHeight: 4,
    itemGap: 18,
    textStyle: { color: chartTheme.value.muted, fontFamily: appStore.fontFamily, fontSize: 12 },
    data: ['下行', '上行'],
  },
  tooltip: {
    trigger: 'axis',
    confine: true,
    backgroundColor: chartTheme.value.tooltip,
    borderColor: chartTheme.value.border,
    padding: 12,
    textStyle: { color: chartTheme.value.text, fontFamily: appStore.fontFamily, fontSize: 13 },
    axisPointer: {
      type: 'line',
      lineStyle: { color: chartTheme.value.border, type: 'dashed' },
    },
    formatter: (params: unknown) => {
      const items = params as TooltipItem[]
      const first = items[0]
      if (!first)
        return ''

      const rows = items.map((item) => {
        const rawValue = Array.isArray(item.value) ? item.value[1] : null
        const label = typeof rawValue === 'number' && Number.isFinite(rawValue) ? formatValue(rawValue) : '—'
        return `<div style="display:flex;align-items:center;gap:8px"><span style="width:7px;height:7px;border-radius:50%;background:${item.color}"></span><span>${item.seriesName}</span><strong style="margin-left:auto;padding-left:12px">${label}</strong></div>`
      }).join('')
      return `<div style="margin-bottom:6px;color:${chartTheme.value.muted}">${formatTime(first.axisValue)}</div><div style="display:grid;gap:4px">${rows}</div>`
    },
  },
  xAxis: {
    type: 'time',
    boundaryGap: false,
    axisLine: { lineStyle: { color: chartTheme.value.border } },
    axisTick: { show: false },
    axisLabel: {
      color: chartTheme.value.muted,
      fontFamily: appStore.numberFontFamily,
      fontSize: 11,
      hideOverlap: true,
      formatter: (value: number) => formatTime(value),
    },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    min: 0,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: chartTheme.value.muted,
      fontFamily: appStore.numberFontFamily,
      fontSize: 11,
      formatter: (value: number) => formatAxisValue(value),
    },
    splitLine: { lineStyle: { color: chartTheme.value.split, type: 'dashed' } },
  },
  series: [
    {
      name: '下行',
      type: 'line',
      data: props.points.map(point => [point.time, point.down]),
      connectNulls: false,
      showSymbol: false,
      smooth: 0.3,
      lineStyle: { width: 2.2, color: chartTheme.value.down, cap: 'round' },
      areaStyle: { color: chartTheme.value.down, opacity: 0.1 },
    },
    {
      name: '上行',
      type: 'line',
      data: props.points.map(point => [point.time, point.up]),
      connectNulls: false,
      showSymbol: false,
      smooth: 0.3,
      lineStyle: { width: 2.2, color: chartTheme.value.up, cap: 'round' },
      areaStyle: { color: chartTheme.value.up, opacity: 0.08 },
    },
  ],
}))
</script>

<template>
  <div class="dashboard-trend" role="img" :aria-label="chartLabel">
    <VChart v-if="hasData" class="dashboard-trend__chart" :option="chartOption" autoresize />
    <p v-else class="dashboard-trend__empty">
      <span class="material-symbols-rounded" aria-hidden="true">query_stats</span>
      {{ emptyText }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.dashboard-trend {
  width: 100%;
  min-width: 0;
  height: 300px;
  overflow: hidden;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-app-card-radius);
  background: var(--md-sys-color-surface-container);
}

.dashboard-trend__chart {
  width: 100%;
  height: 100%;
}

.dashboard-trend__empty {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
}

.dashboard-trend__empty .material-symbols-rounded {
  font-size: 20px;
}

@media (max-width: 640px) {
  .dashboard-trend {
    height: 230px;
  }
}
</style>
