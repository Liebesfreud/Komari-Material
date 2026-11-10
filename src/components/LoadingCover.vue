<script setup lang="ts">
import '@material/web/progress/circular-progress.js'
</script>

<template>
  <div class="loading-cover" role="status" aria-live="polite">
    <md-circular-progress class="loading-cover__progress" indeterminate aria-label="Loading" />
  </div>
</template>

<style scoped lang="scss">
.loading-cover {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  width: 100vw;
  height: 100vh;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--md-sys-color-background) 82%, transparent);
}

.loading-cover__progress {
  --md-circular-progress-size: 48px;
}
</style>
