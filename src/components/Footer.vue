<script setup lang="ts">
import type { VersionInfo } from '@/utils/api'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { getSharedApi } from '@/utils/api'
import { sanitizeNavigationUrl } from '@/utils/urlHelper'

const appStore = useAppStore()
const api = getSharedApi()
const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__
const serverVersion = ref<VersionInfo | null>(null)
let idleCallbackId: number | null = null
let fallbackTimer: ReturnType<typeof window.setTimeout> | null = null

async function fetchServerVersion() {
  try {
    serverVersion.value = await api.getVersion()
  }
  catch {
    // 静默失败
  }
}

onMounted(() => {
  if (typeof window.requestIdleCallback === 'function') {
    idleCallbackId = window.requestIdleCallback(() => void fetchServerVersion(), { timeout: 2000 })
  }
  else {
    fallbackTimer = window.setTimeout(() => void fetchServerVersion(), 1000)
  }
})

onUnmounted(() => {
  if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(idleCallbackId)
  }
  if (fallbackTimer !== null) {
    window.clearTimeout(fallbackTimer)
  }
})

const formattedServerVersion = computed(() => serverVersion.value?.version ?? null)
const barStyle = computed(() => appStore.fullWidth ? {} : { maxWidth: appStore.maxPageWidth })

const showIcp = computed(() => appStore.icpEnabled && appStore.icpNumber)
const showPolice = computed(() => appStore.policeEnabled && appStore.policeNumber)
const showFiling = computed(() => showIcp.value || showPolice.value)
const safeIcpUrl = computed(() => sanitizeNavigationUrl(appStore.icpUrl))
const safePoliceUrl = computed(() => sanitizeNavigationUrl(appStore.policeUrl))
</script>

<template>
  <footer class="material-footer">
    <div class="material-footer__inner" :style="barStyle">
      <div class="material-footer__brand">
        <span class="material-footer__mark" aria-hidden="true">
          <span class="material-symbols-rounded">monitor_heart</span>
        </span>
        <span class="material-footer__brand-copy">
          <strong>Komari Material</strong>
          <span>Material Design 3 theme for Komari Monitor</span>
        </span>
      </div>

      <div class="material-footer__supporting">
        <nav class="material-footer__links" aria-label="项目链接">
          <a href="https://github.com/komari-monitor/komari" target="_blank" rel="noopener noreferrer">
            <span>Komari Monitor</span>
            <span class="material-symbols-rounded" aria-hidden="true">open_in_new</span>
          </a>
          <a href="https://github.com/Liebesfreud/Komari-Material" target="_blank" rel="noopener noreferrer">
            <span>GitHub</span>
            <span class="material-symbols-rounded" aria-hidden="true">open_in_new</span>
          </a>
        </nav>

        <div v-if="showFiling" class="material-footer__filing">
          <a v-if="showIcp && safeIcpUrl" :href="safeIcpUrl" target="_blank" rel="noopener noreferrer">
            {{ appStore.icpNumber }}
          </a>
          <span v-else-if="showIcp">{{ appStore.icpNumber }}</span>
          <span v-if="showIcp && showPolice" aria-hidden="true">·</span>
          <a v-if="showPolice && safePoliceUrl" :href="safePoliceUrl" target="_blank" rel="noopener noreferrer">
            {{ appStore.policeNumber }}
          </a>
          <span v-else-if="showPolice">{{ appStore.policeNumber }}</span>
        </div>

        <div
          class="material-footer__version"
          :title="`Theme v${buildVersion} (${buildGitHash})${formattedServerVersion ? ` · Komari v${formattedServerVersion}` : ''}`"
        >
          <span>Theme v{{ buildVersion }}</span>
          <template v-if="formattedServerVersion">
            <span aria-hidden="true">·</span>
            <span>Core v{{ formattedServerVersion }}</span>
          </template>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.material-footer {
  width: 100%;
  margin: 48px auto 0;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
}

.material-footer__inner {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 32px;
  margin: 0 auto;
  border-top: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 46%, transparent);
  padding: 20px clamp(16px, 2.4vw, 32px) 28px;
}

.material-footer__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.material-footer__mark {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--md-sys-shape-corner-small);
  color: var(--md-sys-color-on-surface-variant);
  background: color-mix(in srgb, var(--md-sys-color-on-surface-variant) 8%, transparent);
  opacity: 0.84;
}

.material-footer__brand-copy {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  min-width: 0;
}

.material-footer__brand-copy strong {
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-title-small-font);
  font-size: var(--md-sys-typescale-title-small-size);
  font-weight: var(--md-sys-typescale-title-small-weight);
  line-height: var(--md-sys-typescale-title-small-line-height);
  letter-spacing: var(--md-sys-typescale-title-small-tracking);
}

.material-footer__brand-copy > span {
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
}

.material-footer__supporting {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 20px;
  margin-left: auto;
}

.material-footer__links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: center;
}

.material-footer__links a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  text-decoration: none;
  transition:
    color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    text-decoration-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

  &:hover {
    color: var(--md-sys-color-primary);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .material-symbols-rounded {
    font-size: 16px;
  }
}

.material-footer__filing {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
}

.material-footer__version {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line-height);
  letter-spacing: var(--md-sys-typescale-label-small-tracking);
  opacity: 0.64;
}

.material-footer a {
  color: var(--md-sys-color-on-surface-variant);
  transition: color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

@media (max-width: 640px) {
  .material-footer {
    margin-top: 40px;
  }

  .material-footer__inner {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: flex-start;
    padding: 18px 16px 24px;
  }

  .material-footer__brand {
    align-items: flex-start;
  }

  .material-footer__brand-copy {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .material-footer__brand-copy > span {
    max-width: 230px;
  }

  .material-footer__supporting {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-left: 0;
    text-align: left;
  }

  .material-footer__links {
    justify-content: flex-start;
  }
}
</style>
