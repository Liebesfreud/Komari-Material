<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { useAppStore } from '@/stores/app'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import { getSharedRpc } from '@/utils/rpc'
import '@material/web/progress/circular-progress.js'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
// 使用共享的 RPC 实例，避免重复创建连接
const rpc = getSharedRpc()

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\'': '&#39;',
    '"': '&quot;',
  })[character]!)
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

// 优化后的图表配色方案（多任务时使用）
const chartColors = new Proxy([] as string[], {
  get(_, prop) {
    const colors = appStore.materialThemeTokens.chartPalette
    const value = colors[prop as keyof string[]]
    return typeof value === 'function' ? value.bind(colors) : value
  },
})

// 从 publicSettings 获取记录保留时间
const maxPingRecordPreserveTime = computed(() => appStore.publicSettings?.ping_record_preserve_time ?? 168)

// 视图选项
const presetViews = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '12 小时', hours: 12 },
  { label: '1 天', hours: 24 },
]

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours: number }[] = []
  const maxHours = maxPingRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push(v)
    }
  }

  const maxPreset = presetViews[presetViews.length - 1]
  if (maxPreset && maxHours > maxPreset.hours) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }
  else if (maxHours > 1 && !presetViews.some(v => v.hours === maxHours)) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('1 天')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours || 1
})

// 初始化默认视图
watch(availableViews, (views) => {
  const firstView = views[0]
  if (!views.some(view => view.label === selectedView.value)) {
    selectedView.value = firstView?.label ?? ''
  }
}, { immediate: true })

// ==================== 类型定义 ====================

interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
}

interface TaskInfo {
  id: number
  name: string
  interval: number
  loss: number
  p99?: number
  p50?: number
  p99_p50_ratio?: number
  min?: number
  max?: number
  avg?: number
  latest?: number
  total?: number
  type?: string
}

interface PingRecordsResponse {
  count: number
  records: PingRecord[]
  tasks?: TaskInfo[]
  from?: string
  to?: string
}

const denseWindowHours = 24

function getPercentile(values: number[], percentile: number): number {
  if (values.length === 0)
    return 0

  const sortedValues = [...values].sort((a, b) => a - b)
  const position = (sortedValues.length - 1) * percentile
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lowerValue = sortedValues[lowerIndex]!
  const upperValue = sortedValues[upperIndex]!
  return Math.round(lowerValue + (upperValue - lowerValue) * (position - lowerIndex))
}

function summarizeTasks(taskInfo: TaskInfo[], records: PingRecord[]): TaskInfo[] {
  return taskInfo.map((task) => {
    const taskRecords = records.filter(record => record.task_id === task.id)
    const validValues = taskRecords
      .filter(record => record.value >= 0)
      .map(record => record.value)
    const p50 = getPercentile(validValues, 0.5)
    const p99 = getPercentile(validValues, 0.99)
    const adjustedBase = Math.max(Math.min(p50, 50), 10)
    let latest = -1
    for (let index = taskRecords.length - 1; index >= 0; index--) {
      const record = taskRecords[index]
      if (record && record.value >= 0) {
        latest = record.value
        break
      }
    }

    return {
      ...task,
      loss: taskRecords.length > 0
        ? taskRecords.filter(record => record.value < 0).length / taskRecords.length * 100
        : 0,
      min: validValues.length > 0 ? Math.min(...validValues) : 0,
      max: validValues.length > 0 ? Math.max(...validValues) : 0,
      avg: validValues.length > 0
        ? Math.trunc(validValues.reduce((sum, value) => sum + value, 0) / validValues.length)
        : 0,
      latest,
      total: taskRecords.length,
      p50,
      p99,
      p99_p50_ratio: p50 > 0 && p99 >= p50 ? (p99 - p50) / adjustedBase : 0,
    }
  })
}

async function fetchPingRecords(uuid: string, hours: number): Promise<PingRecordsResponse> {
  if (hours <= denseWindowHours) {
    return rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
      uuid,
      type: 'ping',
      hours,
    })
  }

  const endTime = dayjs()
  const startTime = endTime.subtract(hours, 'hour')
  const windowCount = Math.ceil(hours / denseWindowHours)
  const requests = Array.from({ length: windowCount }, (_, index) => {
    const windowStart = startTime.add(index * denseWindowHours, 'hour')
    const windowEnd = startTime.add(Math.min((index + 1) * denseWindowHours, hours), 'hour')
    return rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
      uuid,
      type: 'ping',
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    })
  })
  const responses = await Promise.all(requests)
  const uniqueRecords = new Map<string, PingRecord>()

  for (const response of responses) {
    for (const record of response.records ?? []) {
      uniqueRecords.set(`${record.client}:${record.task_id}:${record.time}`, record)
    }
  }

  const records = [...uniqueRecords.values()]
    .sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
  const taskInfo = [...responses]
    .reverse()
    .find(response => response.tasks && response.tasks.length > 0)
    ?.tasks ?? []

  return {
    count: records.length,
    records,
    tasks: summarizeTasks(taskInfo, records),
    from: startTime.toISOString(),
    to: endTime.toISOString(),
  }
}

// 数据状态
const remoteData = shallowRef<PingRecord[]>([])
const tasks = shallowRef<TaskInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let latestFetchId = 0

// 任务选择
const selectedTaskIds = ref<number[]>([])
const cutPeak = ref(false)

const chartMargin = { top: 12, right: 24, bottom: 52, left: 56 }

// ==================== 数据获取 ====================

async function fetchRecords() {
  const requestId = ++latestFetchId
  if (!props.uuid || maxPingRecordPreserveTime.value <= 0) {
    remoteData.value = []
    tasks.value = []
    loading.value = false
    error.value = null
    return
  }

  const uuid = props.uuid
  const hours = selectedHours.value
  loading.value = true
  error.value = null

  try {
    const result = await fetchPingRecords(uuid, hours)

    if (requestId !== latestFetchId)
      return

    const records = [...(result?.records || [])]
      .sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())

    remoteData.value = records
    tasks.value = result?.tasks || []

    if (tasks.value.length > 0 && selectedTaskIds.value.length === 0) {
      selectedTaskIds.value = tasks.value.map(t => t.id)
    }
  }
  catch (err) {
    if (requestId !== latestFetchId)
      return

    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
    tasks.value = []
  }
  finally {
    if (requestId === latestFetchId) {
      loading.value = false
    }
  }
}

// ==================== 数据处理 ====================

const mergedData = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return []

  const taskList = tasks.value

  const taskIntervals = taskList
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60
  const toleranceMs = Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)),
  )

  const grouped: Map<number, Record<string, unknown>> = new Map()
  const anchors: number[] = []

  for (const rec of data) {
    const ts = dayjs(rec.time).valueOf()
    let anchor: number | null = null

    for (const a of anchors) {
      if (Math.abs(a - ts) <= toleranceMs) {
        anchor = a
        break
      }
    }

    const useTs = anchor ?? ts
    if (!grouped.has(useTs)) {
      grouped.set(useTs, { time: dayjs(useTs).toISOString() })
      if (anchor === null) {
        anchors.push(useTs)
      }
    }

    const group = grouped.get(useTs)!
    group[rec.task_id] = rec.value < 0 ? null : rec.value
  }

  const merged = Array.from(grouped.values()).sort(
    (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
  )

  const hours = selectedHours.value
  const lastItem = merged[merged.length - 1]
  const lastTs = lastItem ? dayjs(lastItem.time as string).valueOf() : dayjs().valueOf()
  const fromTs = lastTs - hours * 3600_000

  let startIdx = 0
  for (let i = 0; i < merged.length; i++) {
    const item = merged[i]
    if (!item)
      continue
    const ts = dayjs(item.time as string).valueOf()
    if (ts >= fromTs) {
      startIdx = Math.max(0, i - 1)
      break
    }
  }

  return merged.slice(startIdx)
})

const chartData = computed(() => {
  let data = mergedData.value
  const selectedKeys = selectedTaskIds.value.map(String)

  if (selectedKeys.length === 0)
    return []

  if (cutPeak.value) {
    data = cutPeakValues(data, selectedKeys)
  }

  if (selectedKeys.length > 0 && data.length > 0) {
    data = interpolateNullsLinear(data, selectedKeys, {
      maxGapMultiplier: 6,
      minCapMs: 2 * 60_000,
      maxCapMs: 30 * 60_000,
    })
  }

  return data
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

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 获取任务颜色（根据任务在完整列表中的索引）
function getTaskColor(taskId: number): string {
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

// 最新值统计（从服务端 tasks 获取，保持颜色顺序）
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  const latestMap = new Map<number, number | null>()
  for (const task of tasks.value) {
    for (let i = remoteData.value.length - 1; i >= 0; i--) {
      const rec = remoteData.value[i]
      if (rec && rec.task_id === task.id && rec.value >= 0) {
        latestMap.set(task.id, rec.value)
        break
      }
    }
  }

  return tasks.value.map((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    return {
      ...task,
      latestValue: latestMap.get(task.id) ?? null,
      color: chartColors[safeIdx]!,
    }
  })
})

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

// 切换任务选中状态
function toggleTask(taskId: number) {
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectedTaskIds.value = []
}

function formatTaskDetail(task: TaskInfo): string {
  const lines: string[] = []
  if (task.min !== undefined)
    lines.push(`最小：${Math.round(task.min)} ms`)
  if (task.max !== undefined)
    lines.push(`最大：${Math.round(task.max)} ms`)
  if (task.avg !== undefined)
    lines.push(`平均：${Math.round(task.avg)} ms`)
  if (task.latest !== undefined)
    lines.push(`最新：${Math.round(task.latest)} ms`)
  if (task.p50 !== undefined)
    lines.push(`P50：${Math.round(task.p50)} ms`)
  if (task.p99 !== undefined)
    lines.push(`P99：${Math.round(task.p99)} ms`)
  if (task.p99_p50_ratio !== undefined)
    lines.push(`波动率：${task.p99_p50_ratio.toFixed(2)}`)
  if (task.interval !== undefined)
    lines.push(`间隔：${task.interval}s`)
  if (task.type)
    lines.push(`类型：${task.type.toUpperCase()}`)
  if (task.total !== undefined)
    lines.push(`总数：${task.total}`)
  return lines.join('\n')
}

// ==================== 图表配置 ====================

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

const pingChartOption = computed(() => {
  const taskList = selectedTasks.value
  const data = chartData.value
  const hours = selectedHours.value

  // 构建 series，确保颜色与卡片一致
  const series = taskList.map((task) => {
    const color = getTaskColor(task.id)
    return {
      name: task.name,
      type: 'line' as const,
      data: data.map(d => d[task.id] as number | null ?? null),
      smooth: cutPeak.value ? 0.6 : 0.4,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2.5, color, cap: 'round' as const },
      itemStyle: { color }, // 确保 symbol 颜色一致
    }
  })

  // 颜色映射表（用于 Tooltip）
  const colorMap = new Map<number, string>()
  tasks.value.forEach((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    colorMap.set(task.id, chartColors[safeIdx]!)
  })

  return {
    animation: false,
    // 全局颜色设置（用于图例等）
    color: tasks.value.map((_, idx) => {
      const safeIdx = Math.max(0, idx % chartColors.length)
      return chartColors[safeIdx]!
    }),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const p = params as Array<{ seriesName: string, value: number | null, dataIndex: number }>
        if (!p.length)
          return ''
        const firstParam = p[0]
        if (!firstParam)
          return ''
        const rowData = data[firstParam.dataIndex]
        if (!rowData)
          return ''

        const time = rowData.time as string
        const timeStr = formatTimeForTooltip(time, hours)
        let html = `<div style="font-weight:500;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'

        // 按延迟值排序显示
        const sortedParams = [...p].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))

        for (const item of sortedParams) {
          if (item.value !== null && item.value !== undefined) {
            // 通过任务名找到对应的任务ID，再获取颜色
            const task = tasks.value.find(t => t.name === item.seriesName)
            const color = task ? colorMap.get(task.id) || chartColors[0] : chartColors[0]
            const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
            const safeSeriesName = escapeHtml(item.seriesName)
            html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeSeriesName}</span><span style="margin-left:auto;font-weight:500;margin-left:16px;font-variant-numeric:tabular-nums">${Math.round(item.value)} ms</span></div>`
          }
        }
        html += '</div>'
        return html
      },
    },
    legend: {
      type: 'scroll',
      bottom: 4,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      data: taskList.map(t => t.name),
    },
    grid: chartMargin,
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
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
    },
    yAxis: {
      type: 'value',
      name: '延迟 (ms)',
      nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
      axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, formatter: '{value}' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: chartThemeColors.value.splitLineColor,
          type: 'dashed' as const,
        },
      },
    },
    series,
  }
})

// ==================== 生命周期 ====================

watch(selectedView, () => {
  selectedTaskIds.value = []
  void fetchRecords()
})

watch(() => props.uuid, () => {
  remoteData.value = []
  tasks.value = []
  selectedTaskIds.value = []
  void fetchRecords()
})

onMounted(() => {
  const firstView = availableViews.value[0]
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
  void fetchRecords()
})

onUnmounted(() => {
  latestFetchId += 1
})

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
</script>

<template>
  <div class="ping-chart">
    <div class="md-control-row ping-chart__range-row">
      <button
        v-for="view in availableViews"
        :key="view.label"
        class="md-control-button"
        :class="{ 'is-active': selectedView === view.label }"
        type="button"
        :aria-pressed="selectedView === view.label"
        @click="selectedView = view.label"
      >
        {{ view.label }}
      </button>
    </div>

    <div class="md-loading-box ping-chart__content" :class="{ 'is-loading': loading }">
      <div v-if="loading" class="ping-chart__loading">
        <md-circular-progress class="md-native-loader" indeterminate aria-label="加载中" />
      </div>

      <div v-if="error" class="md-alert md-alert--error">
        <span class="material-symbols-rounded">error</span>
        <span>{{ error }}</span>
      </div>

      <div v-else-if="tasks.length === 0 && !loading" class="md-empty">
        <span class="material-symbols-rounded">timeline</span>
        <span>暂无延迟数据</span>
      </div>

      <template v-else>
        <div v-if="latestValues.length > 0" class="ping-task-grid">
          <article
            v-for="task in latestValues"
            :key="task.id"
            class="md-card ping-task-card"
            :class="[
              selectedTaskIds.includes(task.id) ? '' : 'ping-task-card--muted',
              { 'md-surface-glass': hasBackgroundBlur },
              blurClass,
            ]"
            :style="{ borderColor: selectedTaskIds.includes(task.id) ? task.color : undefined }"
            :title="formatTaskDetail(task)"
            @click="toggleTask(task.id)"
          >
            <span class="ping-task-card__stripe" :style="{ backgroundColor: task.color }" />
            <div class="ping-task-card__body">
              <div class="ping-task-card__title-row">
                <strong>{{ task.name }}</strong>
                <span class="material-symbols-rounded">info</span>
              </div>
              <div class="ping-task-card__meta md-number">
                <span>{{ task.latestValue !== null ? `${Math.round(task.latestValue)} ms` : '-' }}</span>
                <span>{{ task.loss.toFixed(1) }}% 丢包</span>
                <span v-if="task.p99_p50_ratio !== undefined">{{ task.p99_p50_ratio.toFixed(1) }} 波动</span>
              </div>
            </div>
          </article>
        </div>

        <div class="ping-chart__toolbar">
          <label class="ping-switch" title="使用 EWMA 算法平滑数据并过滤突变值">
            <input v-model="cutPeak" type="checkbox">
            <span class="ping-switch__track"><span class="ping-switch__thumb" /></span>
            <span>裁剪峰值</span>
          </label>

          <div class="ping-chart__actions">
            <button class="md-control-button" type="button" @click="showAllTasks">
              全选
            </button>
            <button class="md-control-button" type="button" @click="hideAllTasks">
              全不选
            </button>
          </div>
        </div>

        <div class="ping-chart__canvas">
          <VChart :option="pingChartOption" autoresize />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ping-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ping-chart__range-row .md-control-button.is-active {
  border-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  background: var(--md-sys-color-primary);
}

.ping-chart__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ping-chart__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ping-task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.ping-task-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  user-select: none;
}

.ping-task-card--muted {
  opacity: 0.52;
}

.ping-task-card__stripe {
  width: 6px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 999px;
}

.ping-task-card__body {
  min-width: 0;
  flex: 1;
}

.ping-task-card__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;

  strong {
    overflow: hidden;
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-small-font);
    font-size: var(--md-sys-typescale-title-small-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-title-small-line-height);
    letter-spacing: var(--md-sys-typescale-title-small-tracking);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .material-symbols-rounded {
    margin-left: auto;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 17px;
  }
}

.ping-task-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 5px;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
}

.ping-chart__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.ping-chart__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ping-switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: var(--md-sys-typescale-label-large-weight);
  line-height: var(--md-sys-typescale-label-large-line-height);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  cursor: pointer;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
}

.ping-switch__track {
  position: relative;
  width: 52px;
  height: 32px;
  border-radius: 999px;
  background: var(--md-sys-color-surface-variant);
  transition: background-color 160ms ease;
}

.ping-switch__thumb {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--md-sys-color-outline);
  transition:
    transform 160ms ease,
    background-color 160ms ease;
}

.ping-switch input:checked + .ping-switch__track {
  background: var(--md-sys-color-primary);
}

.ping-switch input:checked + .ping-switch__track .ping-switch__thumb {
  background: var(--md-sys-color-on-primary);
  transform: translateX(20px);
}

.ping-chart__canvas {
  height: 320px;
}
</style>
