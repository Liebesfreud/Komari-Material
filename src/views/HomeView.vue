<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { computed, defineAsyncComponent, nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import HomeSkeleton from '@/components/HomeSkeleton.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { isRegionMatch } from '@/utils/regionHelper'

defineOptions({
  name: 'HomeView',
})

const NodeCard = defineAsyncComponent(() => import('@/components/NodeCard.vue'))
const NodeCompactList = defineAsyncComponent(() => import('@/components/NodeCompactList.vue'))
const NodeGeneralCards = defineAsyncComponent(() => import('@/components/NodeGeneralCards.vue'))
const NodeList = defineAsyncComponent(() => import('@/components/NodeList.vue'))
const WorldMap = defineAsyncComponent(() => import('@/components/WorldMap.vue'))

const appStore = useAppStore()
const nodesStore = useNodesStore()
const router = useRouter()

onActivated(() => {
  if (appStore.homeScrollPosition > 0) {
    nextTick(() => {
      window.scrollTo({ top: appStore.homeScrollPosition, behavior: 'instant' })
    })
  }
})

onDeactivated(() => {
  appStore.homeScrollPosition = window.scrollY
})

const searchText = ref('')
const debouncedSearchText = ref('')
const updateDebouncedSearch = useDebounceFn((value: string) => {
  debouncedSearchText.value = value
}, 300)

watch(searchText, (value) => {
  updateDebouncedSearch(value)
})

const groups = computed(() => {
  return [
    {
      tab: '全部节点',
      name: 'all',
    },
    ...nodesStore.groups.map(group => ({
      tab: group,
      name: group,
    })),
  ]
})

const hiddenGroupsFromAllSet = computed(() => new Set(appStore.hiddenGroupsFromAll))
const hasGroupsHiddenFromAll = computed(() => {
  return nodesStore.groups.some(group => hiddenGroupsFromAllSet.value.has(group.trim()))
})

const showGroupTabs = computed(() => {
  if (appStore.hideSingleGroupTab && nodesStore.groups.length <= 1 && !hasGroupsHiddenFromAll.value) {
    return false
  }
  return true
})

watch(
  () => nodesStore.groups,
  (groups) => {
    const currentGroup = appStore.nodeSelectedGroup
    if (currentGroup !== 'all' && !groups.includes(currentGroup)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
  { immediate: true },
)

function isNodeMatchSearch(node: typeof nodesStore.nodes[number], search: string): boolean {
  if (!search.trim())
    return true

  const lowerSearch = search.toLowerCase().trim()
  if (node.name.toLowerCase().includes(lowerSearch))
    return true
  if (node.region && isRegionMatch(node.region, search))
    return true
  if (node.os && node.os.toLowerCase().includes(lowerSearch))
    return true
  if (node.group && node.group.toLowerCase().includes(lowerSearch))
    return true
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch))
    return true
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch))
    return true

  return false
}

const nodeList = computed(() => {
  let filteredNodes = appStore.nodeSelectedGroup === 'all'
    ? nodesStore.nodes.filter(node => !hiddenGroupsFromAllSet.value.has((node.group || '').trim()))
    : nodesStore.nodes.filter(node => node.group === appStore.nodeSelectedGroup)

  if (debouncedSearchText.value.trim()) {
    filteredNodes = filteredNodes.filter(node => isNodeMatchSearch(node, debouncedSearchText.value))
  }

  return filteredNodes
})

const alertClass = computed(() => {
  const type = appStore.alertType
  if (type === 'error')
    return 'md-alert--error'
  if (type === 'success')
    return 'md-alert--success'
  if (type === 'warning')
    return 'md-alert--warning'
  return ''
})

function updateSearch(event: Event) {
  searchText.value = (event.target as HTMLInputElement).value
}

function clearSearch() {
  searchText.value = ''
  debouncedSearchText.value = ''
}

function handleNodeClick(node: typeof nodesStore.nodes[number]) {
  router.push({ name: 'instance-detail', params: { id: node.uuid } })
}
</script>

<template>
  <div class="home-view">
    <HomeSkeleton v-if="appStore.loading" />

    <template v-else>
      <div v-if="appStore.connectionError" class="home-view__alert-wrap">
        <div class="md-alert md-alert--error">
          <span class="material-symbols-rounded">error</span>
          <div>
            <strong>RPC 服务错误</strong>
            <div>连接服务器失败，请检查网络设置或刷新页面后再试。</div>
          </div>
        </div>
      </div>

      <div v-if="appStore.alertEnabled && appStore.alertContent" class="home-view__alert-wrap">
        <div class="md-alert" :class="alertClass">
          <span class="material-symbols-rounded">campaign</span>
          <div>
            <strong v-if="appStore.alertTitle">{{ appStore.alertTitle }}</strong>
            <MarkdownRenderer :content="appStore.alertContent" />
          </div>
        </div>
      </div>

      <div class="home-view__overview">
        <NodeGeneralCards />
        <WorldMap @node-click="handleNodeClick" />
      </div>

      <div class="home-view__divider md-wavy-divider" />

      <section class="node-info">
        <div class="node-toolbar">
          <div v-if="showGroupTabs" class="md-tab-row node-toolbar__groups" role="radiogroup" aria-label="节点分组">
            <button
              v-for="group in groups"
              :key="group.name"
              class="md-tab-button"
              :class="{ 'is-active': appStore.nodeSelectedGroup === group.name }"
              role="radio"
              :aria-checked="appStore.nodeSelectedGroup === group.name"
              type="button"
              @click="appStore.nodeSelectedGroup = group.name"
            >
              {{ group.tab }}
            </button>
          </div>

          <div class="node-toolbar__actions">
            <label class="node-toolbar__search" aria-label="搜索节点">
              <span class="material-symbols-rounded" aria-hidden="true">search</span>
              <input
                type="search"
                placeholder="搜索节点"
                :value="searchText"
                @input="updateSearch"
              >
              <button
                v-if="searchText"
                class="node-toolbar__search-clear"
                type="button"
                aria-label="清空搜索"
                title="清空搜索"
                @click="clearSearch"
              >
                <span class="material-symbols-rounded" aria-hidden="true">close</span>
              </button>
            </label>

            <div class="md-segmented-control node-toolbar__view-toggle" role="radiogroup" aria-label="节点视图">
              <button
                class="md-segmented-control__button"
                :class="{ 'is-active': appStore.nodeViewMode === 'card' }"
                role="radio"
                :aria-checked="appStore.nodeViewMode === 'card'"
                aria-label="卡片视图"
                type="button"
                title="卡片视图"
                @click="appStore.nodeViewMode = 'card'"
              >
                <span class="material-symbols-rounded">grid_view</span>
              </button>
              <button
                class="md-segmented-control__button"
                :class="{ 'is-active': appStore.nodeViewMode === 'list' }"
                role="radio"
                :aria-checked="appStore.nodeViewMode === 'list'"
                aria-label="列表视图"
                type="button"
                title="列表视图"
                @click="appStore.nodeViewMode = 'list'"
              >
                <span class="material-symbols-rounded">view_list</span>
              </button>
              <button
                class="md-segmented-control__button"
                :class="{ 'is-active': appStore.nodeViewMode === 'compact-list' }"
                role="radio"
                :aria-checked="appStore.nodeViewMode === 'compact-list'"
                aria-label="双栏列表视图"
                type="button"
                title="双栏列表视图"
                @click="appStore.nodeViewMode = 'compact-list'"
              >
                <span class="material-symbols-rounded">view_comfy</span>
              </button>
            </div>
          </div>
        </div>

        <div class="nodes">
          <div v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'" class="node-card-grid">
            <NodeCard v-for="node in nodeList" :key="node.uuid" :node="node" @click="handleNodeClick(node)" />
          </div>

          <NodeList v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'" :nodes="nodeList" @click="handleNodeClick" />

          <NodeCompactList v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'compact-list'" :nodes="nodeList" @click="handleNodeClick" />

          <div v-else class="md-empty">
            <span class="material-symbols-rounded">inbox</span>
            <span>暂无节点</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.home-view__alert-wrap {
  padding: 8px 16px;
}

.home-view__overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;

  @media (min-width: 1024px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;

    :deep(.general-info) {
      height: 100%;
      padding-right: 8px;
      padding-top: 12px;
      padding-bottom: 12px;
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }

    :deep(.general-card) {
      min-height: 0;
      padding-top: 10px;
      padding-bottom: 10px;
    }

    :deep(.world-map-section) {
      padding-left: 8px;
      padding-top: 12px;
      padding-bottom: 12px;
    }
  }
}

.home-view__divider {
  margin: 0 16px;
}

.node-info {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.node-toolbar {
  --node-toolbar-control-height: 40px;

  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
}

.node-toolbar__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
  margin-left: auto;
}

.node-toolbar__search {
  position: relative;
  display: flex;
  flex: 0 1 420px;
  min-width: 220px;
  max-width: 520px;
  height: var(--node-toolbar-control-height);
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0 6px 0 16px;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container-high);
  transition:
    border-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    box-shadow var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    background var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

  &:focus-within {
    border-color: var(--md-sys-color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent);
    color: var(--md-sys-color-primary);
    background: var(--md-sys-color-surface-container-highest);
  }

  .material-symbols-rounded {
    flex: 0 0 auto;
    font-size: 22px;
  }

  input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--md-sys-color-on-surface);
    background: transparent;
    font: inherit;
    font-family: var(--md-sys-typescale-body-large-font);
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: var(--md-sys-typescale-body-large-weight);
    line-height: var(--md-sys-typescale-body-large-line-height);
    letter-spacing: var(--md-sys-typescale-body-large-tracking);

    &::placeholder {
      color: var(--md-sys-color-on-surface-variant);
      opacity: 0.72;
    }

    &::-webkit-search-cancel-button {
      display: none;
    }
  }
}

.node-toolbar__search-clear {
  display: inline-flex;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  cursor: pointer;
  transition:
    background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

  &:hover {
    color: var(--md-sys-color-on-surface);
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }

  .material-symbols-rounded {
    font-size: 20px;
  }
}

.node-toolbar__view-toggle {
  height: 40px;
}

.node-toolbar__groups {
  flex: 1 1 auto;
  min-width: 0;
  height: 48px;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  .md-tab-button {
    min-height: 48px;
    padding: 0 14px;
  }
}

.node-card-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: var(--md-app-grid-gap);

  @media (min-width: 640px) {
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .node-toolbar {
    flex-wrap: wrap;
    gap: 8px;
    overflow: visible;
  }

  .node-toolbar__actions {
    width: 100%;
    min-width: 0;
    gap: 8px;
  }

  .node-toolbar__search {
    min-width: 0;
    max-width: none;
    flex: 1 1 auto;
    height: var(--node-toolbar-control-height);
    padding-left: 14px;
  }

  .node-toolbar__search input {
    font-size: var(--md-sys-typescale-body-large-size);
  }

  .node-toolbar__search-clear {
    width: 40px;
    height: 40px;
  }

  .node-toolbar__groups {
    flex: 0 0 auto;
    width: 100%;
    max-width: none;
  }
}
</style>
