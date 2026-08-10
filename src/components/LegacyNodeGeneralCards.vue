<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'

const appStore = useAppStore()
const nodesStore = useNodesStore()

const now = useNow({ interval: 1000 })
const currentTime = computed(() => now.value.toLocaleString())

const totalSpeed = computed(() => {
  const onlineNodes = nodesStore.nodes.filter(node => node.online)
  const up = onlineNodes.reduce((sum, node) => sum + (node.net_out || 0), 0)
  const down = onlineNodes.reduce((sum, node) => sum + (node.net_in || 0), 0)
  return { up, down }
})

const totalTraffic = computed(() => {
  const up = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
  const down = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
  return { up, down }
})

const onlineRegionCount = computed(() => {
  return new Set(
    nodesStore.nodes
      .filter(node => node.online && node.region !== '')
      .map(node => node.region),
  ).size
})

const onlineNodeCount = computed(() => nodesStore.nodes.filter(node => node.online).length)
const formattedTrafficUp = computed(() => formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals))
const formattedTrafficDown = computed(() => formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals))
const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))

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
</script>

<template>
  <section class="general-info" :class="{ 'general-info--comfortable': appStore.materialDensity === 'comfortable' }">
    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__value md-number">
        {{ currentTime }}
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">schedule</span>
        当前时间
      </div>
    </article>

    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__value md-number">
        {{ onlineNodeCount }}<span>/{{ nodesStore.nodes.length }}</span>
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">monitor_heart</span>
        在线节点
      </div>
    </article>

    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__value md-number">
        {{ onlineRegionCount }}
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">public</span>
        点亮区域
      </div>
    </article>

    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__metric-stack md-number">
        <div>
          <span class="material-symbols-rounded">upload</span>
          <strong>{{ formattedTrafficUp.value }}</strong>
          <small>{{ formattedTrafficUp.unit }}</small>
        </div>
        <div>
          <span class="material-symbols-rounded">download</span>
          <strong>{{ formattedTrafficDown.value }}</strong>
          <small>{{ formattedTrafficDown.unit }}</small>
        </div>
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">swap_vert</span>
        流量总览
      </div>
    </article>

    <article class="md-card general-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, cardBlurClass]">
      <div class="general-card__metric-stack md-number">
        <div>
          <span class="material-symbols-rounded">arrow_upward</span>
          <strong>{{ formattedSpeedUp.value }}</strong>
          <small>{{ formattedSpeedUp.unit }}</small>
        </div>
        <div>
          <span class="material-symbols-rounded">arrow_downward</span>
          <strong>{{ formattedSpeedDown.value }}</strong>
          <small>{{ formattedSpeedDown.unit }}</small>
        </div>
      </div>
      <div class="general-card__label">
        <span class="material-symbols-rounded">bolt</span>
        网络速率
      </div>
    </article>
  </section>
</template>

<style scoped lang="scss">
.general-info {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: var(--md-app-grid-gap);
  padding: 16px;

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.general-card {
  display: flex;
  min-height: var(--md-app-row-height);
  flex-direction: row-reverse;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;

  @media (min-width: 640px) {
    min-height: 132px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--md-app-card-padding);
  }
}

.general-info--comfortable .general-card {
  @media (min-width: 640px) {
    min-height: 150px;
  }
}

.general-card__value {
  min-width: 0;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-title-medium-font);
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: 800;
  line-height: var(--md-sys-typescale-title-medium-line-height);
  letter-spacing: var(--md-sys-typescale-title-medium-tracking);
  word-break: break-word;

  span {
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-label-medium-font);
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  }

  @media (min-width: 640px) {
    font-family: var(--md-sys-typescale-headline-small-font);
    font-size: var(--md-sys-typescale-headline-small-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-headline-small-line-height);
    letter-spacing: var(--md-sys-typescale-headline-small-tracking);
  }
}

.general-card__label {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: var(--md-sys-typescale-label-medium-size);
  font-weight: var(--md-sys-typescale-label-medium-weight);
  line-height: var(--md-sys-typescale-label-medium-line-height);
  letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  white-space: nowrap;
}

.general-card__metric-stack {
  display: flex;
  gap: 12px;

  @media (min-width: 640px) {
    flex-direction: column;
    gap: 6px;
  }

  div {
    display: inline-flex;
    min-width: 0;
    align-items: baseline;
    gap: 4px;
  }

  .material-symbols-rounded {
    align-self: center;
    color: var(--md-sys-color-primary);
    font-size: 16px;
  }

  strong {
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-medium-font);
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-title-medium-line-height);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);

    @media (min-width: 640px) {
      font-family: var(--md-sys-typescale-title-large-font);
      font-size: var(--md-sys-typescale-title-large-size);
      font-weight: 800;
      line-height: var(--md-sys-typescale-title-large-line-height);
      letter-spacing: var(--md-sys-typescale-title-large-tracking);
    }
  }

  small {
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: var(--md-sys-typescale-label-small-weight);
    line-height: var(--md-sys-typescale-label-small-line-height);
    letter-spacing: var(--md-sys-typescale-label-small-tracking);
    white-space: nowrap;
  }
}
</style>
