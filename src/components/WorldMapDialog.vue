<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { WorldMapMarker } from '@/utils/worldMap'
import { computed } from 'vue'
import WorldMapChart from '@/components/WorldMapChart.vue'
import { useAppStore } from '@/stores/app'
import { getWorldMapMarkers } from '@/utils/worldMap'

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

function getStatusClass(node: NodeData): string {
  return node.online ? 'world-map-dialog__node--online' : 'world-map-dialog__node--offline'
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
        <p class="world-map-dialog__hint">
          点击地图上的节点标记，或侧栏中的节点，可查看详情。
        </p>
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

        <div class="world-map-dialog__section-heading">
          <strong>区域节点</strong>
          <span>在线 / 总数</span>
        </div>

        <div v-if="markers.length > 0" class="world-map-dialog__regions">
          <article v-for="marker in markers" :key="marker.code" class="world-map-dialog__region">
            <header class="world-map-dialog__region-header">
              <div class="world-map-dialog__region-name">
                <i :style="{ backgroundColor: getMarkerColor(marker) }" aria-hidden="true" />
                <strong>{{ marker.name }}</strong>
                <code>{{ marker.code }}</code>
              </div>
              <strong class="world-map-dialog__region-count">{{ marker.onlineCount }}/{{ marker.count }}</strong>
            </header>

            <div class="world-map-dialog__nodes">
              <button
                v-for="node in marker.nodes"
                :key="node.uuid"
                class="world-map-dialog__node"
                :class="getStatusClass(node)"
                type="button"
                :title="`查看 ${node.name} 详情`"
                @click="handleNodeClick(node)"
              >
                <i aria-hidden="true" />
                <span>{{ node.name }}</span>
                <small>{{ node.online ? '在线' : '离线' }}</small>
              </button>
            </div>
          </article>

          <article v-if="unmappedNodes.length > 0" class="world-map-dialog__region world-map-dialog__region--unmapped">
            <header class="world-map-dialog__region-header">
              <div class="world-map-dialog__region-name">
                <i :style="{ backgroundColor: chartColors.onSurfaceVariant }" aria-hidden="true" />
                <strong>未标注区域</strong>
              </div>
              <strong class="world-map-dialog__region-count">{{ unmappedNodes.filter(node => node.online).length }}/{{ unmappedNodes.length }}</strong>
            </header>
            <div class="world-map-dialog__nodes">
              <button
                v-for="node in unmappedNodes"
                :key="node.uuid"
                class="world-map-dialog__node"
                :class="getStatusClass(node)"
                type="button"
                :title="`查看 ${node.name} 详情`"
                @click="handleNodeClick(node)"
              >
                <i aria-hidden="true" />
                <span>{{ node.name }}</span>
                <small>{{ node.online ? '在线' : '离线' }}</small>
              </button>
            </div>
          </article>
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
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
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

.world-map-dialog__hint {
  margin: 10px 2px 0;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
}

.world-map-dialog__sidebar {
  min-width: 0;
  height: var(--world-map-dialog-panel-height);
  overflow: auto;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 24px;
  padding: 16px;
  background: var(--md-sys-color-surface-container);
}

.world-map-dialog__sidebar-header,
.world-map-dialog__section-heading,
.world-map-dialog__region-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.world-map-dialog__sidebar-header {
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

.world-map-dialog__section-heading {
  padding: 16px 0 8px;

  strong {
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-small-font);
    font-size: var(--md-sys-typescale-title-small-size);
  }

  span {
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
  }
}

.world-map-dialog__regions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.world-map-dialog__region {
  border-radius: 16px;
  padding: 10px;
  background: var(--md-sys-color-surface-container-high);
}

.world-map-dialog__region--unmapped {
  background: var(--md-sys-color-surface-container-highest);
}

.world-map-dialog__region-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;

  > i {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-label-large-font);
    font-size: var(--md-sys-typescale-label-large-size);
    white-space: nowrap;
  }

  code {
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-app-number-font-family);
    font-size: 11px;
  }
}

.world-map-dialog__region-count {
  flex: 0 0 auto;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-app-number-font-family);
  font-size: 12px;
}

.world-map-dialog__nodes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 60%, transparent);
}

.world-map-dialog__node {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 7px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 8px;
  padding: 5px 4px;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--md-sys-color-surface-container-highest);
    outline: none;
  }

  > i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--md-sys-typescale-body-small-font);
    font-size: var(--md-sys-typescale-body-small-size);
    white-space: nowrap;
  }

  small {
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
  }

  &--online {
    > i {
      background: var(--md-sys-color-primary);
    }

    small {
      color: var(--md-sys-color-primary);
    }
  }

  &--offline {
    > i {
      background: var(--md-sys-color-tertiary);
    }

    small {
      color: var(--md-sys-color-tertiary);
    }
  }
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

  .world-map-dialog__viewport,
  .world-map-dialog__empty {
    height: auto;
    aspect-ratio: 2.13 / 1;
  }

  .world-map-dialog__chart {
    width: 100%;
  }

  .world-map-dialog__sidebar {
    height: auto;
    max-height: none;
  }
}

@media (max-width: 520px) {
  .world-map-dialog__layout {
    gap: 12px;
  }

  .world-map-dialog__map-panel {
    padding-top: 0;
  }

  .world-map-dialog__sidebar {
    border-radius: 20px;
    padding: 14px;
  }
}
</style>
