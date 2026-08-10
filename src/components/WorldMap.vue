<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { computed, defineAsyncComponent, h } from 'vue'
import WorldMapChart from '@/components/WorldMapChart.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getWorldMapMarkers } from '@/utils/worldMap'

const emit = defineEmits<{
  nodeClick: [node: NodeData]
}>()

const WorldMapDialog = defineAsyncComponent(() => import('@/components/WorldMapDialog.vue'))

const appStore = useAppStore()
const nodesStore = useNodesStore()

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

const regionMarkers = computed(() => getWorldMapMarkers(nodesStore.nodes))

function handleNodeClick(node: NodeData): void {
  emit('nodeClick', node)
}

function openExpandedMap(): void {
  window.$modal.create({
    title: '节点世界分布地图',
    content: () => h(WorldMapDialog, {
      nodes: nodesStore.nodes,
      onNodeClick: (node: NodeData) => {
        window.$modal.destroyAll()
        emit('nodeClick', node)
      },
    }),
    size: 'large',
  })
}
</script>

<template>
  <section class="world-map-section">
    <article
      class="md-card world-map-card"
      :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]"
      aria-label="节点世界分布地图"
    >
      <div class="world-map-card__body">
        <div v-if="regionMarkers.length > 0" class="world-map__viewport">
          <div class="world-map__chart">
            <WorldMapChart :markers="regionMarkers" @node-click="handleNodeClick" />
          </div>

          <button
            class="material-icon-button world-map__expand"
            type="button"
            title="展开地图"
            aria-label="展开节点世界分布地图"
            aria-haspopup="dialog"
            @click="openExpandedMap"
          >
            <span class="material-symbols-rounded" aria-hidden="true">open_in_full</span>
          </button>
        </div>

        <div v-else class="world-map__empty">
          <span class="material-symbols-rounded" aria-hidden="true">location_off</span>
          <strong>暂无可定位的节点</strong>
          <span>节点地区信息同步后会显示在地图上</span>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped lang="scss">
.world-map-section {
  padding: 0 16px 12px;
}

.world-map-card {
  display: block;
  min-width: 0;
  padding: 8px;
}

.world-map-card__body {
  min-width: 0;
}

.world-map__viewport {
  position: relative;
  display: flex;
  justify-content: center;
  /* 外层保持紧凑高度，实际地图由 .world-map__chart 保持正常比例。 */
  aspect-ratio: 2.4 / 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.world-map__chart {
  width: auto;
  height: 100%;
  aspect-ratio: 2.13 / 1;
  max-width: 100%;
  min-width: 0;
}

.world-map__expand {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 1;
  width: 38px;
  height: 38px;
  border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 78%, transparent);
  color: var(--md-sys-color-on-surface);
  background: color-mix(in srgb, var(--md-sys-color-surface-container-high) 90%, transparent);
  box-shadow: var(--md-app-elevation-1);
  backdrop-filter: blur(8px);

  .material-symbols-rounded {
    font-size: 20px;
  }
}

.world-map__empty {
  display: flex;
  aspect-ratio: 2.4 / 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--md-sys-color-outline-variant);
  border-radius: 24px;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container-low);

  .material-symbols-rounded {
    color: var(--md-sys-color-primary);
    font-size: 32px;
  }

  strong {
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-small-font);
    font-size: var(--md-sys-typescale-title-small-size);
  }

  span:last-child {
    font-family: var(--md-sys-typescale-body-small-font);
    font-size: var(--md-sys-typescale-body-small-size);
  }
}

@media (max-width: 520px) {
  .world-map-card {
    padding: 8px;
  }

  .world-map__viewport,
  .world-map__empty {
    aspect-ratio: 2.4 / 1;
  }

  .world-map__expand {
    right: 8px;
    bottom: 8px;
  }
}
</style>
