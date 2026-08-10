<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<template>
  <div class="home-skeleton" role="status" aria-live="polite" aria-busy="true">
    <span class="sr-only">正在加载节点数据</span>

    <div class="home-skeleton__overview">
      <section
        class="home-skeleton__general"
        :class="{ 'home-skeleton__general--comfortable': appStore.materialDensity === 'comfortable' }"
      >
        <div v-for="index in 6" :key="`general-${index}`" class="home-skeleton__general-card">
          <div class="home-skeleton__pulse home-skeleton__line home-skeleton__line--lg" />
          <div class="home-skeleton__pulse home-skeleton__line home-skeleton__line--sm" />
        </div>
      </section>

      <section class="home-skeleton__world-map">
        <div class="home-skeleton__pulse home-skeleton__world-map-body" />
      </section>
    </div>

    <div class="home-skeleton__divider md-wavy-divider" />

    <section class="home-skeleton__nodes">
      <div class="home-skeleton__toolbar">
        <div class="home-skeleton__pulse home-skeleton__tabs" />
        <div class="home-skeleton__toolbar-actions">
          <div class="home-skeleton__pulse home-skeleton__search" />
          <div class="home-skeleton__pulse home-skeleton__toggle" />
        </div>
      </div>

      <div class="home-skeleton__grid">
        <article v-for="index in 6" :key="`node-${index}`" class="home-skeleton__node-card">
          <div class="home-skeleton__node-header">
            <div class="home-skeleton__pulse home-skeleton__avatar" />
            <div class="home-skeleton__node-title">
              <div class="home-skeleton__pulse home-skeleton__line home-skeleton__line--md" />
              <div class="home-skeleton__pulse home-skeleton__line home-skeleton__line--xs" />
            </div>
            <div class="home-skeleton__pulse home-skeleton__chip" />
          </div>

          <div class="home-skeleton__metrics">
            <div v-for="metric in 4" :key="`metric-${index}-${metric}`" class="home-skeleton__metric">
              <div class="home-skeleton__pulse home-skeleton__line home-skeleton__line--xs" />
              <div class="home-skeleton__pulse home-skeleton__bar" />
            </div>
          </div>

          <div class="home-skeleton__pulse home-skeleton__summary" />
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.home-skeleton__pulse {
  position: relative;
  overflow: hidden;
  background: color-mix(
    in srgb,
    var(--md-sys-color-surface-container-highest) 88%,
    var(--md-sys-color-outline-variant)
  );

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--md-sys-color-surface) 55%, transparent) 50%,
      transparent 100%
    );
    animation: home-skeleton-shimmer 1.4s ease-in-out infinite;
  }
}

.home-skeleton__general {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: var(--md-app-grid-gap);
  padding: 16px;

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.home-skeleton__overview {
  display: grid;
  min-width: 0;

  @media (min-width: 1024px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;

    .home-skeleton__general {
      height: 100%;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }

    .home-skeleton__general-card {
      min-height: 0;
    }
  }
}

.home-skeleton__general-card {
  display: flex;
  min-height: var(--md-app-row-height);
  flex-direction: row-reverse;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-radius: var(--md-app-card-radius);
  padding: 12px 14px;
  background: var(--md-sys-color-surface-container);

  @media (min-width: 640px) {
    min-height: 132px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--md-app-card-padding);
  }
}

.home-skeleton__general--comfortable .home-skeleton__general-card {
  @media (min-width: 640px) {
    min-height: 150px;
  }
}

.home-skeleton__world-map {
  display: flex;
  min-width: 0;
  flex-direction: column;
  margin: 0 16px 16px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-app-card-radius);
  padding: var(--md-app-card-padding);
  background: var(--md-sys-color-surface-container);

  @media (min-width: 1024px) {
    margin-top: 16px;
  }
}

.home-skeleton__world-map-body {
  aspect-ratio: 2.13 / 1;
  min-height: 0;
  flex: 0 0 auto;
  border-radius: 24px;
}

.home-skeleton__divider {
  margin: 0 16px;
}

.home-skeleton__nodes {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.home-skeleton__toolbar {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.home-skeleton__tabs {
  flex: 1 1 auto;
  min-width: 0;
  height: 40px;
  border-radius: 999px;
}

.home-skeleton__toolbar-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
  align-items: center;
  margin-left: auto;
}

.home-skeleton__search {
  width: min(42vw, 280px);
  height: 40px;
  border-radius: 999px;
}

.home-skeleton__toggle {
  width: 132px;
  height: 40px;
  border-radius: 999px;
}

.home-skeleton__grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: var(--md-app-grid-gap);

  @media (min-width: 640px) {
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  }
}

.home-skeleton__node-card {
  display: flex;
  min-height: 280px;
  flex-direction: column;
  gap: 16px;
  border-radius: var(--md-app-card-radius);
  padding: var(--md-app-card-padding);
  background: var(--md-sys-color-surface-container);
}

.home-skeleton__node-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-skeleton__avatar {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 10px;
}

.home-skeleton__node-title {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
}

.home-skeleton__chip {
  width: 52px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.home-skeleton__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.home-skeleton__metric {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home-skeleton__bar {
  height: 8px;
  border-radius: 999px;
}

.home-skeleton__summary {
  height: 56px;
  margin-top: auto;
  border-radius: 14px;
}

.home-skeleton__line {
  height: 14px;
  border-radius: 999px;
}

.home-skeleton__line--lg {
  width: 58%;
  height: 22px;
}

.home-skeleton__line--md {
  width: 62%;
}

.home-skeleton__line--sm {
  width: 42%;
}

.home-skeleton__line--xs {
  width: 34%;
  height: 12px;
}

@media (max-width: 640px) {
  .home-skeleton__search {
    width: 180px;
  }

  .home-skeleton__toggle {
    width: 120px;
  }
}

@keyframes home-skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
