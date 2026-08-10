<script setup lang="ts">
import type { ECElementEvent } from 'echarts/core'
import type { GeometryCollection } from 'topojson-specification'
import type { NodeData } from '@/stores/nodes'
import type { WorldMapMarker } from '@/utils/worldMap'
import { registerMap } from 'echarts/core'
import { feature } from 'topojson-client'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import worldAtlas from 'world-atlas/countries-110m.json'
import { useAppStore } from '@/stores/app'
import '@/utils/echarts'

const props = defineProps<{
  markers: WorldMapMarker[]
}>()

const emit = defineEmits<{
  nodeClick: [node: NodeData]
}>()

const worldMapGeoJson = feature(worldAtlas, worldAtlas.objects.countries as GeometryCollection)

function normalizeAntimeridianRing(ring: number[][]): number[][] {
  const normalized: number[][] = []

  for (const coordinate of ring) {
    const longitude = coordinate[0]
    const latitude = coordinate[1]
    if (longitude === undefined || latitude === undefined)
      continue

    let nextLongitude = longitude
    const previousLongitude = normalized[normalized.length - 1]?.[0]

    if (previousLongitude !== undefined) {
      while (nextLongitude - previousLongitude > 180)
        nextLongitude -= 360
      while (nextLongitude - previousLongitude < -180)
        nextLongitude += 360
    }

    normalized.push([nextLongitude, latitude])
  }

  const first = ring[0]
  const last = ring[ring.length - 1]
  const normalizedFirst = normalized[0]
  if (first && last && normalizedFirst && first[0] === last[0] && first[1] === last[1] && normalized.length > 1)
    normalized[normalized.length - 1] = [...normalizedFirst]

  return normalized
}

function normalizeWorldMapGeoJson(geoJson: typeof worldMapGeoJson): typeof worldMapGeoJson {
  const normalized = structuredClone(geoJson)

  normalized.features.forEach((country) => {
    const geometry = country.geometry
    if (!geometry)
      return

    if (geometry.type === 'Polygon') {
      geometry.coordinates = geometry.coordinates.map(normalizeAntimeridianRing)
    }
    else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates = geometry.coordinates.map(polygon => polygon.map(normalizeAntimeridianRing))
    }
  })

  return normalized
}

const normalizedWorldMapGeoJson = normalizeWorldMapGeoJson(worldMapGeoJson)
registerMap('komari-world', normalizedWorldMapGeoJson as Parameters<typeof registerMap>[1])

const appStore = useAppStore()

const chartColors = computed(() => {
  const colors = appStore.materialThemeTokens.colors
  return {
    text: colors['on-surface']!,
    land: colors['surface-container-highest']!,
    landBorder: colors['outline-variant']!,
    primary: colors.primary!,
    secondary: colors.secondary!,
    tertiary: colors.tertiary!,
    tooltip: colors['surface-container-high']!,
  }
})

function getMarkerTone(marker: WorldMapMarker): 'online' | 'mixed' | 'offline' {
  if (marker.onlineCount === 0)
    return 'offline'
  if (marker.onlineCount === marker.count)
    return 'online'
  return 'mixed'
}

function getMarkerColor(marker: WorldMapMarker): string {
  const tone = getMarkerTone(marker)
  if (tone === 'online')
    return chartColors.value.primary
  if (tone === 'mixed')
    return chartColors.value.secondary
  return chartColors.value.tertiary
}

function getPointMarker(params: unknown): WorldMapMarker | undefined {
  if (!params || typeof params !== 'object')
    return undefined

  const data = (params as { data?: unknown }).data
  if (!data || typeof data !== 'object')
    return undefined

  const index = (data as { markerIndex?: unknown }).markerIndex
  return typeof index === 'number' ? props.markers[index] : undefined
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\'': '&#39;',
    '"': '&quot;',
  })[character]!)
}

function formatTooltip(params: unknown): string {
  const marker = getPointMarker(params)
  if (!marker)
    return ''

  return `<strong>${escapeHtml(marker.name)} · ${marker.code}</strong><br>在线节点：${marker.onlineCount}/${marker.count}`
}

function getPointLabel(params: unknown): string {
  const marker = getPointMarker(params)
  return marker && marker.count > 1 ? String(marker.count) : ''
}

const chartOption = computed(() => ({
  animationDuration: 420,
  animationDurationUpdate: 260,
  tooltip: {
    trigger: 'item' as const,
    confine: true,
    backgroundColor: chartColors.value.tooltip,
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 12,
    padding: [9, 12],
    textStyle: {
      color: chartColors.value.text,
      fontSize: 13,
      lineHeight: 20,
    },
    extraCssText: 'box-shadow: none;',
    formatter: (params: unknown) => formatTooltip(params),
  },
  geo: {
    map: 'komari-world',
    roam: false,
    silent: true,
    left: 4,
    right: 4,
    top: 4,
    bottom: 8,
    itemStyle: {
      areaColor: chartColors.value.land,
      borderColor: chartColors.value.landBorder,
      borderWidth: 0.7,
    },
    regions: props.markers.map(marker => ({
      name: marker.mapName,
      itemStyle: {
        areaColor: getMarkerColor(marker),
        borderColor: getMarkerColor(marker),
        borderWidth: 1.15,
        opacity: marker.onlineCount > 0 ? 0.42 : 0.28,
      },
      emphasis: {
        itemStyle: {
          areaColor: getMarkerColor(marker),
          borderColor: chartColors.value.text,
          borderWidth: 1.5,
          opacity: 0.62,
        },
      },
    })),
    emphasis: {
      itemStyle: {
        areaColor: chartColors.value.land,
      },
    },
  },
  series: [{
    name: '节点位置',
    type: 'scatter' as const,
    coordinateSystem: 'geo' as const,
    symbol: 'circle',
    symbolSize: (value: number[]) => Math.min(28, 13 + Math.log2(Math.max(1, Number(value[2])))) as number,
    data: props.markers.map((marker, markerIndex) => ({
      name: marker.name,
      value: [marker.coordinate[0], marker.coordinate[1], marker.count],
      markerIndex,
      itemStyle: {
        color: getMarkerColor(marker),
        borderColor: chartColors.value.tooltip,
        borderWidth: 2,
        shadowBlur: 8,
        shadowColor: getMarkerColor(marker),
      },
    })),
    label: {
      show: true,
      formatter: (params: unknown) => getPointLabel(params),
      color: chartColors.value.tooltip,
      fontFamily: 'var(--md-app-number-font-family)',
      fontSize: 9,
      fontWeight: 700,
    },
    emphasis: {
      scale: true,
      label: {
        show: true,
      },
    },
  }],
}))

function handleChartClick(params: ECElementEvent): void {
  if (params.seriesType !== 'scatter')
    return

  const marker = getPointMarker(params)
  const node = marker?.nodes[0]
  if (node)
    emit('nodeClick', node)
}
</script>

<template>
  <VChart
    class="world-map-chart"
    :option="chartOption"
    autoresize
    aria-label="节点世界分布地图"
    @click="handleChartClick"
  />
</template>

<style scoped lang="scss">
.world-map-chart {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
