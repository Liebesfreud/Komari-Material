<script setup lang="ts">
import { computed, defineAsyncComponent, h, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const AppearancePanel = defineAsyncComponent(() => import('./AppearancePanel.vue'))
const LoginDialog = defineAsyncComponent(() => import('./LoginDialog.vue'))

const router = useRouter()
const appStore = useAppStore()
const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))
const siteFavicon = ref('/favicon.ico')

const brandTitle = computed(() => appStore.publicSettings?.sitename || 'Komari Material')
const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.cardBlurRadius > 0)
const themeAction = computed(() => {
  if (appStore.themeMode === 'light') {
    return { icon: 'light_mode', label: '浅色主题' }
  }
  if (appStore.themeMode === 'dark') {
    return { icon: 'dark_mode', label: '深色主题' }
  }
  return { icon: 'contrast', label: '自动主题' }
})

const barStyle = computed(() => appStore.fullWidth ? {} : { maxWidth: appStore.maxPageWidth })

function handleButtonClick(action: string) {
  switch (action) {
    case 'toggleTheme':
      appStore.updateThemeMode()
      break
    case 'openAppearancePanel':
      window.$modal.create({
        title: '外观设置',
        content: () => h(AppearancePanel),
      })
      break
    case 'jumpToSetting':
      location.href = '/admin'
      break
    case 'openLoginDialog':
      window.$modal.create({
        title: '登录',
        content: () => h(LoginDialog),
      })
      break
  }
}
</script>

<template>
  <header
    class="material-top-app-bar"
    :class="{
      'material-top-app-bar--scrolled': isScrolled,
      'md-surface-glass': isScrolled && hasBackgroundBlur,
    }"
  >
    <div class="material-top-app-bar__inner" :style="barStyle">
      <button class="material-brand" type="button" aria-label="返回首页" @click="router.push('/')">
        <span class="material-brand__mark" aria-hidden="true">
          <img class="material-brand__avatar" :src="siteFavicon" alt="">
        </span>
        <span class="material-brand__copy">
          <strong class="material-brand__text">{{ brandTitle }}</strong>
        </span>
      </button>

      <nav class="material-top-app-bar__actions" aria-label="全局操作">
        <button
          class="material-icon-button"
          type="button"
          title="外观设置"
          aria-label="打开外观设置"
          @click="handleButtonClick('openAppearancePanel')"
        >
          <span class="material-symbols-rounded">palette</span>
        </button>

        <button
          class="material-icon-button"
          type="button"
          :title="themeAction.label"
          :aria-label="`${themeAction.label}，点击切换`"
          @click="handleButtonClick('toggleTheme')"
        >
          <span class="material-symbols-rounded">{{ themeAction.icon }}</span>
        </button>

        <button
          v-if="appStore.isLoggedIn"
          class="material-icon-button"
          type="button"
          title="后台管理"
          aria-label="进入后台管理"
          @click="handleButtonClick('jumpToSetting')"
        >
          <span class="material-symbols-rounded">settings</span>
        </button>

        <button
          v-if="!appStore.isLoggedIn && appStore.showLoginButton"
          class="material-login-button"
          type="button"
          title="登录"
          aria-label="登录"
          @click="handleButtonClick('openLoginDialog')"
        >
          <span class="material-symbols-rounded">login</span>
          <span class="material-login-button__label">登录</span>
        </button>
      </nav>
    </div>
  </header>
</template>

<style scoped lang="scss">
.material-top-app-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  width: 100%;
  margin: 0 auto;
  background: transparent;
  transition:
    background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    box-shadow var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    border-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

.material-top-app-bar--scrolled {
  border-bottom: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 64%, transparent);
  background: var(--md-sys-color-surface-container);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--md-sys-color-shadow) 14%, transparent);
}

.material-top-app-bar__inner {
  display: flex;
  width: 100%;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 auto;
  padding: 8px clamp(16px, 2.4vw, 32px);
}

.material-brand {
  display: inline-flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 10px;
  border: 0;
  padding: 0;
  color: var(--md-sys-color-on-surface);
  background: transparent;
  cursor: pointer;

  &:hover .material-brand__mark {
    border-color: var(--md-sys-color-outline);
    background: var(--md-sys-color-secondary-container);
  }
}

.material-brand__mark {
  display: inline-grid;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 68%, transparent);
  border-radius: 10px;
  background: var(--md-sys-color-surface-container-high);
  transition:
    border-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

.material-brand__avatar {
  width: 26px;
  height: 26px;
  border-radius: var(--md-sys-shape-corner-small);
}

.material-brand__copy {
  display: flex;
  min-width: 0;
  text-align: left;
}

.material-brand__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-title-medium-font);
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: var(--md-sys-typescale-title-medium-weight);
  line-height: var(--md-sys-typescale-title-medium-line-height);
  letter-spacing: var(--md-sys-typescale-title-medium-tracking);
}

.material-top-app-bar__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.material-top-app-bar__actions .material-icon-button {
  width: 48px;
  height: 48px;
}

.material-login-button {
  display: inline-flex;
  height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: var(--md-sys-shape-corner-full);
  margin-left: 4px;
  padding: 0 16px;
  color: var(--md-sys-color-on-secondary-container);
  background: var(--md-sys-color-secondary-container);
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: var(--md-sys-typescale-label-large-weight);
  line-height: var(--md-sys-typescale-label-large-line-height);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    box-shadow var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

  &:hover {
    background: color-mix(
      in srgb,
      var(--md-sys-color-on-secondary-container) var(--md-app-state-hover),
      var(--md-sys-color-secondary-container)
    );
    box-shadow: var(--md-app-elevation-1);
  }

  &:active {
    background: color-mix(
      in srgb,
      var(--md-sys-color-on-secondary-container) var(--md-app-state-pressed),
      var(--md-sys-color-secondary-container)
    );
    box-shadow: none;
  }
}

.material-login-button .material-symbols-rounded {
  font-size: 18px;
}

@media (max-width: 640px) {
  .material-top-app-bar__inner {
    gap: 8px;
    padding: 8px 16px;
  }

  .material-brand {
    gap: 8px;
  }

  .material-brand__mark {
    width: 36px;
    height: 36px;
  }

  .material-brand__avatar {
    width: 26px;
    height: 26px;
  }

  .material-top-app-bar__actions {
    gap: 0;
  }

  .material-login-button {
    margin-left: 0;
  }
}

@media (max-width: 420px) {
  .material-brand__text {
    font-size: var(--md-sys-typescale-title-small-size);
    line-height: var(--md-sys-typescale-title-small-line-height);
  }

  .material-login-button {
    width: 40px;
    gap: 0;
    padding: 0;
  }

  .material-login-button__label {
    display: none;
  }
}
</style>
