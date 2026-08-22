<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { WorldMapMarker } from '@/utils/worldMap'
import { computed } from 'vue'

const props = defineProps<{
  marker: WorldMapMarker
  x: number
  y: number
  maxWidth: number
  maxHeight: number
}>()

const emit = defineEmits<{
  select: [node: NodeData]
}>()

const MENU_WIDTH = 232
const MENU_MARGIN = 10

const menuStyle = computed(() => {
  const left = Math.max(MENU_MARGIN, Math.min(props.x - MENU_WIDTH / 2, props.maxWidth - MENU_WIDTH - MENU_MARGIN))
  const estimatedHeight = 46 + Math.min(props.marker.nodes.length, 6) * 32
  const top = props.y + estimatedHeight + MENU_MARGIN > props.maxHeight
    ? Math.max(MENU_MARGIN, props.y - estimatedHeight - MENU_MARGIN)
    : props.y + MENU_MARGIN
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${MENU_WIDTH}px`,
  }
})

function getStatusClass(node: NodeData): string {
  return node.online ? 'world-map-node-menu__node--online' : 'world-map-node-menu__node--offline'
}
</script>

<template>
  <div
    class="world-map-node-menu"
    :style="menuStyle"
    role="menu"
    :aria-label="`选择 ${marker.name} 的节点`"
    @pointerdown.stop
    @click.stop
  >
    <header class="world-map-node-menu__header">
      <strong>{{ marker.name }}</strong>
      <span class="world-map-node-menu__count">{{ marker.onlineCount }}/{{ marker.count }} 在线</span>
    </header>

    <div class="world-map-node-menu__list">
      <button
        v-for="node in marker.nodes"
        :key="node.uuid"
        class="world-map-node-menu__node"
        :class="getStatusClass(node)"
        type="button"
        role="menuitem"
        :title="`查看 ${node.name} 详情`"
        @click="emit('select', node)"
      >
        <i aria-hidden="true" />
        <span>{{ node.name }}</span>
        <small>{{ node.online ? '在线' : '离线' }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.world-map-node-menu {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  max-height: 260px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 72%, transparent);
  border-radius: 16px;
  padding: 6px;
  background: var(--md-sys-color-surface-container-high);
  box-shadow: var(--md-app-elevation-2);
  backdrop-filter: blur(12px);
}

.world-map-node-menu__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 10px;
  padding: 6px 8px;
  background: color-mix(in srgb, var(--md-sys-color-surface-container-highest) 82%, transparent);

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-small-font);
    font-size: var(--md-sys-typescale-title-small-size);
    white-space: nowrap;
  }
}

.world-map-node-menu__count {
  flex: 0 0 auto;
  color: var(--md-sys-color-primary);
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
}

.world-map-node-menu__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.world-map-node-menu__node {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 7px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 10px;
  padding: 6px 8px;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease;

  &:hover,
  &:focus-visible {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
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
    color: var(--md-sys-color-on-surface);
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
</style>
