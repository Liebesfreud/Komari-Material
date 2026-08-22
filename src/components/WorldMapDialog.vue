<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { WorldMapContinent } from '@/utils/worldMap'
import { computed, ref } from 'vue'
import WorldMapChart from '@/components/WorldMapChart.vue'
import { useAppStore } from '@/stores/app'
import {
  getWorldMapContinent,
  getWorldMapContinentName,
  getWorldMapMarkers,
  WORLD_MAP_CONTINENT_ORDER,
} from '@/utils/worldMap'

const props = defineProps<{
  nodes: NodeData[]
}>()

const emit = defineEmits<{
  nodeClick: [node: NodeData]
}>()

const appStore = useAppStore()

const markers = computed(() => getWorldMapMarkers(props.nodes))
const totalNodeCount = computed(() => props.nodes.length)
const onlineNodeCount = computed(() => props.nodes.filter(node => node.online).length)
const onlineRegionCount = computed(() => markers.value.filter(marker => marker.onlineCount > 0).length)
const mappedNodeIds = computed(() => new Set(markers.value.flatMap(marker => marker.nodes.map(node => node.uuid))))
const unmappedNodes = computed(() => props.nodes.filter(node => !mappedNodeIds.value.has(node.uuid)))

const chartColors = computed(() => {
  const colors = appStore.materialThemeTokens.colors
  return {
    primary: colors.primary!,
    secondary: colors.secondary!,
    tertiary: colors.tertiary!,
    onSurfaceVariant: colors['on-surface-variant']!,
  }
})

function getStatusClass(node: NodeData): string {
  return node.online ? 'world-map-dialog__node--online' : 'world-map-dialog__node--offline'
}

interface WorldMapSidebarNode {
  node: NodeData
  flagCode: string | null
  regionName: string
}

interface WorldMapContinentGroup {
  key: string
  name: string
  regionCount: number
  onlineCount: number
  totalCount: number
  nodes: WorldMapSidebarNode[]
}

const continentGroups = computed<WorldMapContinentGroup[]>(() => {
  const grouped = new Map<WorldMapContinent, WorldMapSidebarNode[]>()
  const regionCount = new Map<WorldMapContinent, number>()

  markers.value.forEach((marker) => {
    const continent = getWorldMapContinent(marker.code)
    regionCount.set(continent, (regionCount.get(continent) ?? 0) + 1)

    marker.nodes.forEach((node) => {
      const entry: WorldMapSidebarNode = { node, flagCode: marker.code, regionName: marker.name }
      const list = grouped.get(continent)
      if (list)
        list.push(entry)
      else
        grouped.set(continent, [entry])
    })
  })

  return WORLD_MAP_CONTINENT_ORDER
    .filter(continent => grouped.has(continent))
    .map(continent => ({
      key: continent,
      name: getWorldMapContinentName(continent),
      regionCount: regionCount.get(continent) ?? 0,
      onlineCount: grouped.get(continent)!.filter(entry => entry.node.online).length,
      totalCount: grouped.get(continent)!.length,
      nodes: grouped.get(continent)!,
    }))
})

const sidebarGroups = computed<WorldMapContinentGroup[]>(() => {
  if (unmappedNodes.value.length === 0)
    return continentGroups.value

  return [
    ...continentGroups.value,
    {
      key: 'unmapped',
      name: '未标注区域',
      regionCount: 0,
      onlineCount: unmappedNodes.value.filter(node => node.online).length,
      totalCount: unmappedNodes.value.length,
      nodes: unmappedNodes.value.map(node => ({ node, flagCode: null, regionName: '未标注区域' })),
    },
  ]
})

const failedFlags = ref(new Set<string>())

function getSidebarFlagSrc(flagCode: string | null): string | undefined {
  return flagCode && !failedFlags.value.has(flagCode) ? `/images/flags/${flagCode}.svg` : undefined
}

function handleFlagError(flagCode: string | null): void {
  if (!flagCode)
    return
  const next = new Set(failedFlags.value)
  next.add(flagCode)
  failedFlags.value = next
}

function handleNodeClick(node: NodeData): void {
  emit('nodeClick', node)
}
</script>

<template>
  <section class="world-map-dialog" aria-label="节点世界分布详情">
    <div class="world-map-dialog__layout">
      <div class="world-map-dialog__map-panel">
        <div v-if="markers.length > 0" class="world-map-dialog__viewport">
          <div class="world-map-dialog__chart">
            <WorldMapChart :markers="markers" @node-click="handleNodeClick" />
          </div>
        </div>
        <div v-else class="world-map-dialog__empty">
          <span class="material-symbols-rounded" aria-hidden="true">location_off</span>
          <strong>暂无可定位的节点</strong>
          <span>节点地区信息同步后会显示在地图上</span>
        </div>

        <div v-if="markers.length > 0" class="world-map-dialog__legend" aria-label="地图标记图例">
          <span class="world-map-dialog__legend-item">
            <i :style="{ backgroundColor: chartColors.primary }" aria-hidden="true" />在线
          </span>
          <span class="world-map-dialog__legend-item">
            <i :style="{ backgroundColor: chartColors.secondary }" aria-hidden="true" />部分在线
          </span>
          <span class="world-map-dialog__legend-item">
            <i :style="{ backgroundColor: chartColors.tertiary }" aria-hidden="true" />离线
          </span>
          <span class="world-map-dialog__legend-hint">点击地图标记或节点可查看详情</span>
        </div>
      </div>

      <aside class="world-map-dialog__sidebar" aria-label="节点和区域详情">
        <header class="world-map-dialog__sidebar-header">
          <div>
            <strong>节点明细</strong>
            <span>{{ markers.length }} 个定位区域</span>
          </div>
          <span class="world-map-dialog__online-pill">
            <i aria-hidden="true" />{{ onlineNodeCount }}/{{ totalNodeCount }} 在线
          </span>
        </header>

        <div class="world-map-dialog__summary" aria-label="地图统计">
          <div class="world-map-dialog__summary-item">
            <strong class="md-number">{{ onlineNodeCount }}</strong>
            <span>在线节点</span>
          </div>
          <div class="world-map-dialog__summary-item">
            <strong class="md-number">{{ onlineRegionCount }}</strong>
            <span>点亮区域</span>
          </div>
          <div class="world-map-dialog__summary-item">
            <strong class="md-number">{{ totalNodeCount }}</strong>
            <span>节点总数</span>
          </div>
        </div>

        <div v-if="sidebarGroups.length > 0" class="world-map-dialog__groups">
          <section
            v-for="group in sidebarGroups"
            :key="group.key"
            class="world-map-dialog__continent"
            :class="{ 'world-map-dialog__continent--unmapped': group.key === 'unmapped' }"
          >
            <header class="world-map-dialog__continent-header">
              <strong>{{ group.name }}</strong>
              <span>{{ group.regionCount > 0 ? `${group.regionCount} 个地区 · ` : '' }}{{ group.onlineCount }}/{{ group.totalCount }}</span>
            </header>

            <div class="world-map-dialog__nodes">
              <button
                v-for="entry in group.nodes"
                :key="entry.node.uuid"
                class="world-map-dialog__node"
                :class="getStatusClass(entry.node)"
                type="button"
                :title="`${entry.node.name} · ${entry.regionName}`"
                @click="handleNodeClick(entry.node)"
              >
                <img
                  v-if="getSidebarFlagSrc(entry.flagCode)"
                  class="world-map-dialog__node-flag"
                  :src="getSidebarFlagSrc(entry.flagCode)"
                  :alt="entry.regionName"
                  loading="lazy"
                  @error="handleFlagError(entry.flagCode)"
                >
                <span v-else class="material-symbols-rounded world-map-dialog__node-flag-fallback" aria-hidden="true">public</span>

                <span class="world-map-dialog__node-name">{{ entry.node.name }}</span>
                <small>{{ entry.node.online ? '在线' : '离线' }}</small>
              </button>
            </div>
          </section>
        </div>

        <p v-else class="world-map-dialog__empty-copy">
          暂无节点区域数据。
        </p>
      </aside>
    </div>
  </section>
</template>

<style scoped lang="scss">
.world-map-dialog {
  min-width: 0;
  --world-map-dialog-panel-height: min(64vh, 620px);
}

.world-map-dialog__layout {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  align-items: start;
  gap: 16px;
}

.world-map-dialog__map-panel {
  min-width: 0;
  padding-top: 0;
}

.world-map-dialog__viewport {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--world-map-dialog-panel-height);
  min-width: 0;
  overflow: hidden;
  border-radius: 24px;
  background: var(--md-sys-color-surface-container);
}

.world-map-dialog__chart {
  width: min(100%, calc(var(--world-map-dialog-panel-height) * 2.13));
  aspect-ratio: 2.13 / 1;
  min-width: 0;

  :deep(.world-map-chart) {
    width: 100%;
    height: 100%;
  }
}

.world-map-dialog__empty {
  display: flex;
  height: var(--world-map-dialog-panel-height);
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--md-sys-color-outline-variant);
  border-radius: 24px;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container);

  .material-symbols-rounded {
    color: var(--md-sys-color-primary);
    font-size: 32px;
  }

  strong {
    color: var(--md-sys-color-on-surface);
  }
}

.world-map-dialog__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-top: 10px;
  padding: 0 2px;
}

.world-map-dialog__legend-item {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);

  > i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
}

.world-map-dialog__legend-hint {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  white-space: nowrap;
}

.world-map-dialog__sidebar {
  min-width: 0;
  max-height: min(64vh, 620px);
  overflow: auto;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 24px;
  padding: 16px;
  background: var(--md-sys-color-surface-container);
}

.world-map-dialog__sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;

  > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  strong {
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-medium-font);
    font-size: var(--md-sys-typescale-title-medium-size);
  }

  span {
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-body-small-font);
    font-size: var(--md-sys-typescale-body-small-size);
  }
}

.world-map-dialog__online-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 5px 8px;
  color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent);
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
}

.world-map-dialog__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  padding: 12px 0;
}

.world-map-dialog__summary-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;

  strong {
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-app-number-font-family);
    font-size: 20px;
    line-height: 1.1;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
    white-space: nowrap;
  }
}

.world-map-dialog__groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
}

.world-map-dialog__continent {
  overflow: hidden;
  border-radius: 16px;
  background: var(--md-sys-color-surface-container-high);
}

.world-map-dialog__continent--unmapped {
  background: var(--md-sys-color-surface-container-highest);
}

.world-map-dialog__continent-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 8px;

  strong {
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-small-font);
    font-size: var(--md-sys-typescale-title-small-size);
  }

  span {
    flex: 0 0 auto;
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
  }
}

.world-map-dialog__nodes {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 8px 9px;
}

.world-map-dialog__node {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 10px;
  padding: 6px 6px;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
    outline: none;
  }

  > small {
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
  }

  &--online > small {
    color: var(--md-sys-color-primary);
  }

  &--offline > small {
    color: var(--md-sys-color-tertiary);
  }
}

.world-map-dialog__node-flag {
  width: 21px;
  height: 15px;
  flex: 0 0 auto;
  border-radius: 2.5px;
  object-fit: cover;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--md-sys-color-outline) 32%, transparent);
}

.world-map-dialog__node-flag-fallback {
  display: inline-flex;
  width: 21px;
  height: 15px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 2.5px;
  color: var(--md-sys-color-on-surface-variant);
  background: color-mix(in srgb, var(--md-sys-color-surface-container-highest) 80%, transparent);
  font-size: 13px;
}

.world-map-dialog__node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  white-space: nowrap;
}

.world-map-dialog__empty-copy {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
}

@media (max-width: 800px) {
  .world-map-dialog__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 窄屏下图表高度由宽度决定，容器改为自适应高度贴合图表，
     否则固定 min(64vh, 620px) 会在地图上下留下大片空白。 */
  .world-map-dialog__viewport,
  .world-map-dialog__empty {
    height: auto;
    aspect-ratio: 2.13 / 1;
  }

  .world-map-dialog__chart {
    width: 100%;
  }

  .world-map-dialog__sidebar {
    max-height: none;
  }
}

@media (max-width: 520px) {
  .world-map-dialog__layout {
    gap: 12px;
  }

  .world-map-dialog__sidebar {
    border-radius: 20px;
    padding: 14px;
  }
}
</style>
