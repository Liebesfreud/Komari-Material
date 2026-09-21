<script setup lang="ts">
import type { RecordFormat } from '@/utils/recordHelper'
import { useIntervalFn } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getSharedApi } from '@/utils/api'
import { formatBytes, formatBytesSplit } from '@/utils/helper'
import { fillMissingTimePoints } from '@/utils/recordHelper'
import { getSharedRpc } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const nodesStore = useNodesStore()

// 从 publicSettings 获取记录保留时间
const maxRecordPreserveTime = computed(() => appStore.publicSettings?.record_preserve_time ?? 720)

// 使用 store 统一归一化后台数据更新间隔（秒）
const dataUpdateInterval = computed(() => {
  return appStore.dataUpdateInterval * 1000
})

// 使用 store 中的 isDark computed
const isDark = computed(() => appStore.isDark)

// 优化后的图表配色方案（基于 Material Design 色彩）
const chartColors = {
  get primary() { return appStore.materialThemeTokens.chartColors.primary },
  get secondary() { return appStore.materialThemeTokens.chartColors.secondary },
  get tertiary() { return appStore.materialThemeTokens.chartColors.tertiary },
  get quaternary() { return appStore.materialThemeTokens.chartColors.quaternary },
  get quinary() { return appStore.materialThemeTokens.chartColors.quinary },
}

// 图表主题相关颜色
const chartThemeColors = computed(() => {
  const colors = appStore.materialThemeTokens.colors
  return {
    text: colors['on-surface']!,
    textSecondary: colors['on-surface-variant']!,
    textTertiary: colors.outline!,
    borderColor: colors['outline-variant']!,
    splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    tooltipBg: colors['surface-container-high']!,
    crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.16)',
  }
})

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 8,
  padding: [10, 14],
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 13,
    lineHeight: 20,
  },
  extraCssText: 'box-shadow: none;',
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

// 图表边距配置
const chartMargin = { top: 12, right: 24, bottom: 32, left: 56 }
const chartMarginWithLegend = { top: 12, right: 24, bottom: 52, left: 56 }

// 视图选项
const presetViews = [
  { label: '4 小时', hours: 4 },
  { label: '1 天', hours: 24 },
  { label: '7 天', hours: 168 },
  { label: '30 天', hours: 720 },
]

interface LoadChartRecord {
  client: string
  time: string
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  load: number
  temp: number
  disk: number
  disk_total: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
}

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours?: number }[] = [{ label: '实时' }]
  const maxHours = maxRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push({ label: v.label, hours: v.hours })
    }
  }

  const maxPreset = presetViews[presetViews.length - 1]
  if (maxPreset && maxHours > maxPreset.hours) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }
  else if (maxHours > 4 && !presetViews.some(v => v.hours === maxHours)) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('实时')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours
})
const isRealtime = computed(() => selectedView.value === '实时')

// 数据状态
const remoteData = shallowRef<LoadChartRecord[]>([])
const loading = ref(false)
const isInitialLoad = ref(true) // 是否为首次加载（用于控制实时模式下的加载状态）
const error = ref<string | null>(null)
let latestFetchId = 0
let activeFetchCount = 0

// 节点信息
const nodeInfo = computed(() => nodesStore.nodesByUuid.get(props.uuid))

// RPC 客户端
const rpc = getSharedRpc()
const api = getSharedApi()

// ==================== 数据获取 ====================

function statusToRecordFormat(records: LoadChartRecord[]): RecordFormat[] {
  return records.map(r => ({
    client: r.client,
    time: r.time,
    cpu: r.cpu ?? null,
    gpu: r.gpu ?? null,
    gpu_usage: null,
    gpu_memory: null,
    ram: r.ram ?? null,
    ram_total: r.ram_total ?? null,
    swap: r.swap ?? null,
    swap_total: r.swap_total ?? null,
    load: r.load ?? null,
    temp: r.temp ?? null,
    disk: r.disk ?? null,
    disk_total: r.disk_total ?? null,
    net_in: r.net_in ?? null,
    net_out: r.net_out ?? null,
    net_total_up: r.net_total_up ?? null,
    net_total_down: r.net_total_down ?? null,
    process: r.process ?? null,
    connections: r.connections ?? null,
    connections_udp: r.connections_udp ?? null,
  }))
}

async function requestRecentData(uuid: string): Promise<LoadChartRecord[]> {
  const result = await rpc.getNodeRecentStatus(uuid)
  return [...(result?.records || [])]
    .sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
    .slice(-150)
}

async function requestHistoryData(uuid: string, hours: number): Promise<LoadChartRecord[]> {
  const response = await api.getLoadRecords(uuid, hours)
  return [...(response.records || [])].sort(
    (a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf(),
  )
}

async function fetchData(options: { skipIfBusy?: boolean } = {}) {
  if (options.skipIfBusy && activeFetchCount > 0)
    return

  const requestId = ++latestFetchId
  if (!props.uuid) {
    remoteData.value = []
    loading.value = false
    error.value = null
    return
  }

  const uuid = props.uuid
  const realtime = isRealtime.value
  const hours = selectedHours.value || 4

  activeFetchCount += 1
  if (!realtime || isInitialLoad.value) {
    loading.value = true
  }
  error.value = null

  try {
    const records = realtime
      ? await requestRecentData(uuid)
      : await requestHistoryData(uuid, hours)

    if (requestId !== latestFetchId)
      return

    remoteData.value = records
  }
  catch (err) {
    if (requestId !== latestFetchId)
      return

    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
  }
  finally {
    activeFetchCount = Math.max(0, activeFetchCount - 1)
    if (requestId === latestFetchId) {
      loading.value = false
      isInitialLoad.value = false
    }
  }
}

// ==================== 数据处理 ====================

const chartData = computed(() => {
  const data = statusToRecordFormat(remoteData.value)
  if (!data.length)
    return []

  if (isRealtime.value) {
    return data
  }

  const hours = selectedHours.value || 4
  const minute = 60
  const hour = minute * 60
  let intervalSec: number
  let maxGap: number

  if (hours <= 4) {
    intervalSec = minute
    maxGap = minute * 2
  }
  else if (hours > 120) {
    intervalSec = hour
    maxGap = hour * 2
  }
  else {
    intervalSec = minute * 15
    maxGap = minute * 30
  }

  return fillMissingTimePoints(data, intervalSec, hours * 3600, maxGap)
})

const latestStatus = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return null
  return data[data.length - 1]
})

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => (selectedHours.value || 1) >= 24)

// 通用 X 轴配置
const baseXAxisConfig = computed(() => ({
  type: 'category' as const,
  data: chartData.value.map(r => formatTime(r.time, showDateInAxis.value)),
  axisLabel: {
    fontSize: 11,
    color: chartThemeColors.value.textSecondary,
    margin: 12,
  },
  axisLine: {
    show: true,
    lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
  },
  axisTick: { show: false },
  boundaryGap: false,
}))

// 通用 Y 轴配置
const baseYAxisConfig = computed(() => ({
  type: 'value' as const,
  axisLabel: {
    fontSize: 11,
    color: chartThemeColors.value.textSecondary,
  },
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: {
    lineStyle: {
      color: chartThemeColors.value.splitLineColor,
      type: 'dashed' as const,
    },
  },
}))

// ==================== 图表配置 ====================

// CPU 图表
const cpuChartOption = computed(() => ({
  animation: false,
  // 全局颜色配置（确保 Tooltip 圆点颜色与线条一致）
  color: [chartColors.primary, chartColors.secondary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, seriesName: string, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:500;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        if (item.seriesName === 'CPU') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>CPU</span><span style="margin-left:auto;font-weight:500;margin-left:16px">${item.value?.toFixed(1) ?? '-'}%</span></div>`
        }
        else if (item.seriesName === '负载') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>系统负载</span><span style="margin-left:auto;font-weight:500;margin-left:16px">${item.value?.toFixed(2) ?? '-'}</span></div>`
        }
      }
      html += '</div>'
      return html
    },
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: [
    {
      ...baseYAxisConfig.value,
      name: 'CPU %',
      nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
      min: 0,
      // 上限交给 ECharts 按当前数据自适应：低负载时曲线不会被压平，满载时仍封顶 100%
      axisLabel: { ...baseYAxisConfig.value.axisLabel, formatter: '{value}%' },
    },
    {
      ...baseYAxisConfig.value,
      name: '负载',
      nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 0, 0, 40] },
      min: 0,
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: 'CPU',
      type: 'line',
      data: chartData.value.map(r => r.cpu),
      smooth: 0.6,
      showSymbol: false,
      yAxisIndex: 0,
      lineStyle: { width: 2.5, color: chartColors.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(255, 107, 107, 0.25)' },
            { offset: 1, color: 'rgba(255, 107, 107, 0.02)' },
          ],
        },
      },
    },
    {
      name: '负载',
      type: 'line',
      data: chartData.value.map(r => r.load),
      smooth: 0.6,
      showSymbol: false,
      yAxisIndex: 1,
      lineStyle: { width: 2.5, color: chartColors.secondary, cap: 'round' as const },
    },
  ],
}))

// 内存图表
const memoryChartOption = computed(() => ({
  animation: false,
  color: [chartColors.primary, chartColors.secondary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, seriesName: string, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const ramUsed = record.ram ?? 0
      const ramTotal = record.ram_total ?? nodeInfo.value?.mem_total ?? 0
      const swapUsed = record.swap ?? 0
      const swapTotal = record.swap_total ?? nodeInfo.value?.swap_total ?? 0
      const ramPercent = ramTotal > 0 ? ((ramUsed / ramTotal) * 100).toFixed(1) : '0'
      const swapPercent = swapTotal > 0 ? ((swapUsed / swapTotal) * 100).toFixed(1) : '0'

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:500;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        if (item.seriesName === 'RAM') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>RAM</span><span style="margin-left:auto;font-weight:500;margin-left:16px">${formatBytes(ramUsed)} (${ramPercent}%)</span></div>`
        }
        else if (item.seriesName === 'Swap') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>Swap</span><span style="margin-left:auto;font-weight:500;margin-left:16px">${formatBytes(swapUsed)} (${swapPercent}%)</span></div>`
        }
      }
      html += '</div>'
      return html
    },
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '内存',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatBytes(val),
    },
  },
  series: [
    {
      name: 'RAM',
      type: 'line',
      data: chartData.value.map(r => r.ram ?? 0),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(255, 107, 107, 0.25)' },
            { offset: 1, color: 'rgba(255, 107, 107, 0.02)' },
          ],
        },
      },
    },
    {
      name: 'Swap',
      type: 'line',
      data: chartData.value.map(r => r.swap ?? 0),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.secondary, cap: 'round' as const },
    },
  ],
}))

// 磁盘图表
const diskChartOption = computed(() => ({
  animation: false,
  color: [chartColors.tertiary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const diskUsed = record.disk ?? 0
      const diskTotal = record.disk_total ?? nodeInfo.value?.disk_total ?? 0
      const diskPercent = diskTotal > 0 ? ((diskUsed / diskTotal) * 100).toFixed(1) : '0'

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${firstParam.color};margin-right:8px;flex-shrink:0"></span>`

      let html = `<div style="font-weight:500;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'
      html += `<div style="display:flex;align-items:center">${colorDot}<span>磁盘已用</span><span style="margin-left:auto;font-weight:500;margin-left:16px">${formatBytes(diskUsed)} (${diskPercent}%)</span></div>`
      html += '</div>'
      return html
    },
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '磁盘',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatBytes(val),
    },
  },
  series: [
    {
      name: '磁盘已用',
      type: 'line',
      data: chartData.value.map(r => r.disk ?? 0),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.tertiary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(78, 205, 196, 0.25)' },
            { offset: 1, color: 'rgba(78, 205, 196, 0.02)' },
          ],
        },
      },
    },
  ],
}))

// 网络图表
const networkChartOption = computed(() => ({
  animation: false,
  color: [chartColors.quinary, chartColors.quaternary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, seriesName: string, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:500;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        const label = item.seriesName === '下载' ? '↓ 下载' : '↑ 上传'
        html += `<div style="display:flex;align-items:center">${colorDot}<span>${label}</span><span style="margin-left:auto;font-weight:500;margin-left:16px">${formatBytes(item.value)}/s</span></div>`
      }
      html += '</div>'
      return html
    },
  },
  legend: {
    data: ['下载', '上传'],
    bottom: 4,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 20,
    icon: 'roundRect',
    textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
  },
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '速度',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatBytes(val),
    },
  },
  series: [
    {
      name: '下载',
      type: 'line',
      data: chartData.value.map(r => r.net_in ?? 0),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.quinary, cap: 'round' as const },
    },
    {
      name: '上传',
      type: 'line',
      data: chartData.value.map(r => r.net_out ?? 0),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.quaternary, cap: 'round' as const },
    },
  ],
}))

// 连接数图表
const connectionsChartOption = computed(() => ({
  animation: false,
  color: [chartColors.primary, chartColors.tertiary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, seriesName: string, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:500;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        const displayValue = item.value != null ? Math.round(item.value) : '-'
        html += `<div style="display:flex;align-items:center">${colorDot}<span>${item.seriesName}</span><span style="margin-left:auto;font-weight:500;margin-left:16px">${displayValue}</span></div>`
      }
      html += '</div>'
      return html
    },
  },
  legend: {
    data: ['TCP', 'UDP'],
    bottom: 4,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 20,
    icon: 'roundRect',
    textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
  },
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '连接数',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    min: 0,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => Math.round(val).toString(),
    },
  },
  series: [
    {
      name: 'TCP',
      type: 'line',
      data: chartData.value.map(r => r.connections ?? 0),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.primary, cap: 'round' as const },
    },
    {
      name: 'UDP',
      type: 'line',
      data: chartData.value.map(r => r.connections_udp ?? 0),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.tertiary, cap: 'round' as const },
    },
  ],
}))

// 进程数图表
const processChartOption = computed(() => ({
  animation: false,
  color: [chartColors.quaternary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = params as Array<{ dataIndex: number, value: number, color: string }>
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${firstParam.color};margin-right:8px;flex-shrink:0"></span>`
      const displayValue = firstParam.value != null ? Math.round(firstParam.value) : '-'

      let html = `<div style="font-weight:500;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'
      html += `<div style="display:flex;align-items:center">${colorDot}<span>进程数</span><span style="margin-left:auto;font-weight:500;margin-left:16px">${displayValue}</span></div>`
      html += '</div>'
      return html
    },
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '进程',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    min: 0,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => Math.round(val).toString(),
    },
  },
  series: [
    {
      name: '进程数',
      type: 'line',
      data: chartData.value.map(r => r.process ?? 0),
      smooth: 0.6,
      showSymbol: false,
      lineStyle: { width: 2.5, color: chartColors.quaternary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(167, 139, 250, 0.25)' },
            { offset: 1, color: 'rgba(167, 139, 250, 0.02)' },
          ],
        },
      },
    },
  ],
}))

// ==================== 实时更新 ====================

// 使用 VueUse 的 useIntervalFn 自动管理定时器
const { pause: pauseRealtimeUpdate, resume: resumeRealtimeUpdate } = useIntervalFn(
  () => void fetchData({ skipIfBusy: true }),
  dataUpdateInterval,
  { immediate: false },
)

// 根据是否为实时模式控制定时器
watch(isRealtime, (realtime) => {
  if (realtime) {
    resumeRealtimeUpdate()
  }
  else {
    pauseRealtimeUpdate()
  }
}, { immediate: true })

// 是否启用模糊背景
const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.backgroundBlur > 0)

// 计算模糊半径类
const blurClass = computed(() => {
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

// ==================== 生命周期 ====================

watch(selectedView, () => {
  isInitialLoad.value = true // 切换视图时重置首次加载状态
  void fetchData()
})

watch(() => props.uuid, () => {
  remoteData.value = []
  isInitialLoad.value = true // 切换节点时重置首次加载状态
  void fetchData()
})

onMounted(() => {
  void fetchData()
})

onUnmounted(() => {
  latestFetchId += 1
})
</script>

<template>
  <div class="load-chart">
    <div class="md-control-row">
      <button
        v-for="view in availableViews"
        :key="view.label"
        class="md-control-button"
        :class="{ 'is-active': selectedView === view.label }"
        type="button"
        @click="selectedView = view.label"
      >
        {{ view.label }}
      </button>
    </div>

    <div class="md-loading-box" :class="{ 'is-loading': loading }">
      <div v-if="loading" class="load-chart__loading">
        <md-circular-progress class="md-native-loader" indeterminate aria-label="加载中" />
      </div>

      <div v-if="error" class="md-alert md-alert--error load-chart__message">
        <span class="material-symbols-rounded">error</span>
        <span>{{ error }}</span>
      </div>

      <div v-else-if="remoteData.length === 0 && !loading" class="md-empty">
        <span class="material-symbols-rounded">monitoring</span>
        <span>暂无负载数据</span>
      </div>

      <div v-else class="load-chart__grid">
        <article class="md-card chart-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <header class="chart-card__header">
            <span>CPU</span>
            <strong v-if="latestStatus?.cpu != null" class="md-number">{{ latestStatus.cpu.toFixed(1) }}<small>%</small></strong>
            <strong v-else>-</strong>
          </header>
          <div class="chart-card__body">
            <VChart :option="cpuChartOption" autoresize />
          </div>
        </article>

        <article class="md-card chart-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <header class="chart-card__header">
            <span>内存</span>
            <strong class="md-number">
              <template v-if="latestStatus?.ram != null">{{ formatBytesSplit(latestStatus.ram, appStore.byteDecimals).value }}<small>{{ formatBytesSplit(latestStatus.ram, appStore.byteDecimals).unit }}</small></template>
              <template v-else>-</template>
            </strong>
          </header>
          <div class="chart-card__body">
            <VChart :option="memoryChartOption" autoresize />
          </div>
        </article>

        <article class="md-card chart-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <header class="chart-card__header">
            <span>磁盘</span>
            <strong class="md-number">
              <template v-if="latestStatus?.disk != null">{{ formatBytesSplit(latestStatus.disk, appStore.byteDecimals).value }}<small>{{ formatBytesSplit(latestStatus.disk, appStore.byteDecimals).unit }}</small></template>
              <template v-else>-</template>
            </strong>
          </header>
          <div class="chart-card__body">
            <VChart :option="diskChartOption" autoresize />
          </div>
        </article>

        <article class="md-card chart-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <header class="chart-card__header">
            <span>网络</span>
            <strong class="md-number chart-card__metric-pair">
              <template v-if="latestStatus?.net_out != null">
                <span>↑{{ formatBytesSplit(latestStatus.net_out, appStore.byteDecimals).value }}<small>{{ formatBytesSplit(latestStatus.net_out, appStore.byteDecimals).unit }}/s</small></span>
              </template>
              <template v-if="latestStatus?.net_in != null">
                <span>↓{{ formatBytesSplit(latestStatus.net_in, appStore.byteDecimals).value }}<small>{{ formatBytesSplit(latestStatus.net_in, appStore.byteDecimals).unit }}/s</small></span>
              </template>
            </strong>
          </header>
          <div class="chart-card__body">
            <VChart :option="networkChartOption" autoresize />
          </div>
        </article>

        <article class="md-card chart-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <header class="chart-card__header">
            <span>连接</span>
            <strong class="md-number chart-card__metric-pair">
              <span>TCP {{ latestStatus?.connections ?? '-' }}</span>
              <span>UDP {{ latestStatus?.connections_udp ?? '-' }}</span>
            </strong>
          </header>
          <div class="chart-card__body">
            <VChart :option="connectionsChartOption" autoresize />
          </div>
        </article>

        <article class="md-card chart-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <header class="chart-card__header">
            <span>进程</span>
            <strong class="md-number">{{ latestStatus?.process ?? '-' }}</strong>
          </header>
          <div class="chart-card__body">
            <VChart :option="processChartOption" autoresize />
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.load-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.load-chart__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--md-app-grid-gap);

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 1280px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.load-chart__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.load-chart__message {
  justify-content: center;
}

.chart-card {
  padding: 12px;
}

.chart-card__header {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-title-medium-font);
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: 800;
  line-height: var(--md-sys-typescale-title-medium-line-height);
  letter-spacing: var(--md-sys-typescale-title-medium-tracking);

  strong {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--md-sys-typescale-label-large-font);
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-label-large-line-height);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
  }

  small {
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: var(--md-sys-typescale-label-small-weight);
    line-height: var(--md-sys-typescale-label-small-line-height);
    letter-spacing: var(--md-sys-typescale-label-small-tracking);
  }
}

.chart-card__metric-pair {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.chart-card__body {
  height: 192px;
}
</style>
