<script setup lang="ts">
import type { MaterialDensity, MonetColorMode, MonetPaletteName } from '@/utils/materialTheme'
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { buildMaterialThemeTokens, MONET_PALETTES, normalizeHexColor } from '@/utils/materialTheme'

type ThemeMode = 'auto' | 'light' | 'dark'
type BackgroundType = 'image' | 'video'
type CardSurfaceStyle = 'solid' | 'translucent'
type TopDataPanel = 'current' | 'legacy'
type AppearanceTab = 'theme' | 'interface' | 'wallpaper'

const appStore = useAppStore()
const activeTab = ref<AppearanceTab>('theme')

const appearanceTabs: Array<{ value: AppearanceTab, label: string, icon: string }> = [
  { value: 'theme', label: '主题', icon: 'palette' },
  { value: 'interface', label: '界面', icon: 'dashboard_customize' },
  { value: 'wallpaper', label: '壁纸', icon: 'wallpaper' },
]

const themeModeOptions: Array<{ value: ThemeMode, label: string, icon: string }> = [
  { value: 'auto', label: '跟随系统', icon: 'contrast' },
  { value: 'light', label: '浅色', icon: 'light_mode' },
  { value: 'dark', label: '深色', icon: 'dark_mode' },
]

const monetModeOptions: Array<{ value: MonetColorMode, label: string, icon: string }> = [
  { value: 'seed', label: '手动色', icon: 'format_color_fill' },
  { value: 'palette', label: '调色盘', icon: 'palette' },
  { value: 'wallpaper', label: '壁纸取色', icon: 'image_search' },
]

const densityOptions: Array<{ value: MaterialDensity, label: string, icon: string }> = [
  { value: 'compact', label: '紧凑', icon: 'density_small' },
  { value: 'comfortable', label: '舒展', icon: 'density_medium' },
]

const topDataPanelOptions: Array<{ value: TopDataPanel, label: string, icon: string }> = [
  { value: 'current', label: '当前布局', icon: 'dashboard' },
  { value: 'legacy', label: '旧版五卡片', icon: 'view_quilt' },
]

const cardSurfaceOptions: Array<{ value: CardSurfaceStyle, label: string, icon: string }> = [
  { value: 'solid', label: '实色', icon: 'rectangle' },
  { value: 'translucent', label: '半透明', icon: 'blur_on' },
]

const selectedPalette = computed<MonetPaletteName>(() => {
  const value = appStore.themeSettings.monetPalette
  if (typeof value === 'string' && value in MONET_PALETTES) {
    return value as MonetPaletteName
  }
  return 'material-teal'
})

const paletteOptions = computed(() => {
  return Object.entries(MONET_PALETTES).map(([key, palette]) => {
    const lightTokens = buildMaterialThemeTokens(
      palette.seedColor,
      false,
      appStore.materialDensity,
      {
        fontFamily: appStore.fontFamily,
        numberFontFamily: appStore.numberFontFamily,
      },
    )
    const darkTokens = buildMaterialThemeTokens(
      palette.seedColor,
      true,
      appStore.materialDensity,
      {
        fontFamily: appStore.fontFamily,
        numberFontFamily: appStore.numberFontFamily,
      },
    )
    return {
      key: key as MonetPaletteName,
      name: palette.name,
      swatches: [
        lightTokens.colors.primary!,
        darkTokens.colors.primary!,
        lightTokens.colors.tertiary!,
      ],
    }
  })
})

const densityModel = computed<MaterialDensity>({
  get: () => appStore.materialDensity,
  set: value => appStore.updateAppearanceSetting('materialDensity', value),
})

const topDataPanelModel = computed<TopDataPanel>({
  get: () => appStore.topDataPanel,
  set: value => appStore.updateAppearanceSetting('topDataPanel', value),
})

const cardSurfaceModel = computed<CardSurfaceStyle>({
  get: () => appStore.cardSurfaceStyle,
  set: value => appStore.updateAppearanceSetting('cardSurfaceStyle', value),
})

const cardOpacityModel = computed<number>({
  get: () => appStore.cardOpacity,
  set: value => appStore.updateAppearanceSetting('cardOpacity', clampNumber(value, 50, 95)),
})

const fullWidthModel = computed<boolean>({
  get: () => appStore.fullWidth,
  set: value => appStore.updateAppearanceSetting('fullWidth', value),
})

const maxPageWidthModel = computed<string>({
  get: () => appStore.maxPageWidth,
  set: value => appStore.updateAppearanceSetting('maxPageWidth', value.trim() || '1800px'),
})

const hiddenGroupsFromAllModel = computed<string>({
  get: () => appStore.hiddenGroupsFromAllText,
  set: value => appStore.updateAppearanceSetting('hiddenGroupsFromAll', value.trim()),
})

const backgroundEnabledModel = computed<boolean>({
  get: () => appStore.backgroundEnabled,
  set: value => appStore.updateAppearanceSetting('backgroundEnabled', value),
})

const backgroundTypeModel = computed<BackgroundType>({
  get: () => appStore.backgroundType,
  set: value => appStore.updateAppearanceSetting('backgroundType', value),
})

const lightBackgroundUrlModel = computed<string>({
  get: () => appStore.lightBackgroundUrl,
  set: value => appStore.updateAppearanceSetting('lightBackgroundUrl', value.trim()),
})

const darkBackgroundUrlModel = computed<string>({
  get: () => appStore.darkBackgroundUrl,
  set: value => appStore.updateAppearanceSetting('darkBackgroundUrl', value.trim()),
})

const backgroundBlurModel = computed<number>({
  get: () => appStore.backgroundBlur,
  set: value => appStore.updateAppearanceSetting('backgroundBlur', clampNumber(value, 0, 40)),
})

const backgroundOverlayModel = computed<number>({
  get: () => appStore.backgroundOverlay,
  set: value => appStore.updateAppearanceSetting('backgroundOverlay', clampNumber(value, 0, 100)),
})

const wallpaperStatus = computed(() => {
  if (appStore.monetColorMode !== 'wallpaper') {
    return '未启用壁纸取色'
  }
  if (appStore.backgroundType !== 'image') {
    return '壁纸取色仅支持图片背景'
  }
  if (!appStore.currentBackgroundUrl) {
    return '请先填写当前模式的图片背景地址'
  }
  if (appStore.wallpaperSeedColor) {
    return `已取色 ${appStore.wallpaperSeedColor}`
  }
  if (appStore.wallpaperSeedError) {
    return '取色失败，已使用调色盘回退'
  }
  return '正在读取壁纸颜色'
})

function clampNumber(value: number, min: number, max: number) {
  const safeValue = Number.isFinite(value) ? value : min
  return Math.min(max, Math.max(min, safeValue))
}

function setThemeMode(value: ThemeMode) {
  appStore.updateThemeMode(value)
}

function setMonetMode(value: MonetColorMode) {
  appStore.updateAppearanceSetting('monetColorMode', value)
}

function setPalette(value: MonetPaletteName) {
  appStore.updateAppearanceSetting('monetPalette', value)
}

function setManualSeedColor(event: Event) {
  const value = (event.target as HTMLInputElement).value
  appStore.updateAppearanceSetting('materialSeedColor', normalizeHexColor(value, appStore.manualMaterialSeedColor))
}

function setActiveTab(tab: AppearanceTab) {
  activeTab.value = tab
}

function handleTabKeydown(event: KeyboardEvent, currentIndex: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
    return

  event.preventDefault()
  let nextIndex = currentIndex
  if (event.key === 'Home')
    nextIndex = 0
  else if (event.key === 'End')
    nextIndex = appearanceTabs.length - 1
  else
    nextIndex = (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + appearanceTabs.length) % appearanceTabs.length

  const nextTab = appearanceTabs[nextIndex]!
  activeTab.value = nextTab.value
  requestAnimationFrame(() => {
    document.getElementById(`appearance-tab-${nextTab.value}`)?.focus()
  })
}
</script>

<template>
  <div class="appearance-panel">
    <div class="appearance-sidebar">
      <nav class="appearance-tabs" role="tablist" aria-label="外观设置分类">
        <button
          v-for="(tab, index) in appearanceTabs"
          :id="`appearance-tab-${tab.value}`"
          :key="tab.value"
          class="appearance-tab"
          :class="{ 'is-active': activeTab === tab.value }"
          role="tab"
          type="button"
          :aria-selected="activeTab === tab.value"
          :aria-controls="`appearance-panel-${tab.value}`"
          :tabindex="activeTab === tab.value ? 0 : -1"
          @click="setActiveTab(tab.value)"
          @keydown="handleTabKeydown($event, index)"
        >
          <span class="material-symbols-rounded">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </div>

    <div class="appearance-tab-content">
      <p v-if="appStore.isAppearanceAdmin" class="appearance-admin-hint">
        <span class="material-symbols-rounded">manage_accounts</span>
        <span>管理员模式：你的改动将写入后台并全站生效。</span>
      </p>
      <div
        v-if="activeTab === 'theme'"
        id="appearance-panel-theme"
        class="appearance-tab-panel"
        role="tabpanel"
        aria-labelledby="appearance-tab-theme"
      >
        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>主题模式</h3>
          </div>
          <div class="appearance-segmented" role="radiogroup" aria-label="主题模式">
            <button
              v-for="option in themeModeOptions"
              :key="option.value"
              class="appearance-segmented__button"
              :class="{ 'is-active': appStore.themeMode === option.value }"
              role="radio"
              :aria-checked="appStore.themeMode === option.value"
              type="button"
              @click="setThemeMode(option.value)"
            >
              <span class="material-symbols-rounded">{{ option.icon }}</span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </section>

        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>主题配色</h3>
            <p v-if="appStore.monetColorMode === 'wallpaper'">
              {{ wallpaperStatus }}
            </p>
          </div>
          <div class="appearance-segmented" role="radiogroup" aria-label="莫奈取色模式">
            <button
              v-for="option in monetModeOptions"
              :key="option.value"
              class="appearance-segmented__button"
              :class="{ 'is-active': appStore.monetColorMode === option.value }"
              role="radio"
              :aria-checked="appStore.monetColorMode === option.value"
              type="button"
              @click="setMonetMode(option.value)"
            >
              <span class="material-symbols-rounded">{{ option.icon }}</span>
              <span>{{ option.label }}</span>
            </button>
          </div>

          <div v-if="appStore.monetColorMode === 'seed'" class="appearance-color-layout appearance-color-layout--seed">
            <label class="appearance-field appearance-field--color">
              <span>手动种子色</span>
              <span class="appearance-color-input">
                <input type="color" :value="appStore.manualMaterialSeedColor" aria-label="选择手动种子色" @input="setManualSeedColor">
                <input type="text" :value="appStore.manualMaterialSeedColor" spellcheck="false" @change="setManualSeedColor">
              </span>
            </label>
          </div>

          <div v-else-if="appStore.monetColorMode === 'palette'" class="appearance-palette-grid" role="radiogroup" aria-label="莫奈调色盘">
            <button
              v-for="palette in paletteOptions"
              :key="palette.key"
              class="appearance-palette"
              :class="{ 'is-active': selectedPalette === palette.key }"
              role="radio"
              :aria-checked="selectedPalette === palette.key"
              :aria-label="`使用${palette.name}主题色`"
              type="button"
              @click="setPalette(palette.key)"
            >
              <span class="appearance-palette__swatches">
                <span
                  v-for="color in palette.swatches"
                  :key="color"
                  class="appearance-palette__swatch"
                  :style="{ backgroundColor: color }"
                />
              </span>
            </button>
          </div>
        </section>
      </div>

      <div
        v-else-if="activeTab === 'interface'"
        id="appearance-panel-interface"
        class="appearance-tab-panel"
        role="tabpanel"
        aria-labelledby="appearance-tab-interface"
      >
        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>首页顶部数据面板</h3>
            <p>选择当前布局或旧版五卡片布局</p>
          </div>
          <div class="appearance-segmented" role="radiogroup" aria-label="首页顶部数据面板">
            <button
              v-for="option in topDataPanelOptions"
              :key="option.value"
              class="appearance-segmented__button"
              :class="{ 'is-active': topDataPanelModel === option.value }"
              role="radio"
              :aria-checked="topDataPanelModel === option.value"
              type="button"
              @click="topDataPanelModel = option.value"
            >
              <span class="material-symbols-rounded">{{ option.icon }}</span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </section>

        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>界面密度</h3>
            <p>调整监控信息的紧凑程度</p>
          </div>
          <div class="appearance-segmented" role="radiogroup" aria-label="界面密度">
            <button
              v-for="option in densityOptions"
              :key="option.value"
              class="appearance-segmented__button"
              :class="{ 'is-active': densityModel === option.value }"
              role="radio"
              :aria-checked="densityModel === option.value"
              type="button"
              @click="densityModel = option.value"
            >
              <span class="material-symbols-rounded">{{ option.icon }}</span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </section>

        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>卡片材质</h3>
            <p>半透明材质会保留 MD3 色调表面与轮廓</p>
          </div>
          <div class="appearance-segmented" role="radiogroup" aria-label="卡片材质">
            <button
              v-for="option in cardSurfaceOptions"
              :key="option.value"
              class="appearance-segmented__button"
              :class="{ 'is-active': cardSurfaceModel === option.value }"
              role="radio"
              :aria-checked="cardSurfaceModel === option.value"
              type="button"
              @click="cardSurfaceModel = option.value"
            >
              <span class="material-symbols-rounded">{{ option.icon }}</span>
              <span>{{ option.label }}</span>
            </button>
          </div>

          <label class="appearance-range appearance-range--prominent" :class="{ 'is-disabled': cardSurfaceModel !== 'translucent' }">
            <span class="appearance-range__header">
              <strong>卡片不透明度</strong>
              <output>{{ cardOpacityModel }}%</output>
            </span>
            <span class="appearance-range__supporting">数值越低，壁纸越清晰</span>
            <input
              v-model.number="cardOpacityModel"
              type="range"
              min="50"
              max="95"
              step="1"
              :disabled="cardSurfaceModel !== 'translucent'"
            >
          </label>
        </section>

        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>页面布局</h3>
            <p>控制页面内容宽度与分组显示</p>
          </div>
          <div class="appearance-field-grid">
            <label class="appearance-switch appearance-switch--wide">
              <input v-model="fullWidthModel" type="checkbox">
              <span>
                <strong>占满屏幕宽度</strong>
                <small>让页面内容使用全部可用宽度</small>
              </span>
            </label>
            <label class="appearance-field">
              <span>最大页面宽度</span>
              <input v-model="maxPageWidthModel" type="text" spellcheck="false" placeholder="1800px">
            </label>
            <label class="appearance-field">
              <span>全部节点隐藏分组</span>
              <input v-model="hiddenGroupsFromAllModel" type="text" spellcheck="false" placeholder="private, staging">
            </label>
          </div>
        </section>
      </div>

      <div
        v-else
        id="appearance-panel-wallpaper"
        class="appearance-tab-panel"
        role="tabpanel"
        aria-labelledby="appearance-tab-wallpaper"
      >
        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>自定义壁纸</h3>
            <p>{{ appStore.isDark ? '当前使用暗色模式背景' : '当前使用亮色模式背景' }}</p>
          </div>
          <div class="appearance-field-grid">
            <label class="appearance-switch">
              <input v-model="backgroundEnabledModel" type="checkbox">
              <span>启用自定义背景</span>
            </label>
            <label class="appearance-field">
              <span>背景类型</span>
              <select v-model="backgroundTypeModel">
                <option value="image">
                  图片
                </option>
                <option value="video">
                  视频
                </option>
              </select>
            </label>
          </div>
        </section>

        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>背景地址</h3>
            <p>可以为亮色与暗色模式使用不同资源</p>
          </div>
          <div class="appearance-field-grid">
            <label class="appearance-field">
              <span>亮色背景地址</span>
              <input v-model="lightBackgroundUrlModel" type="url" spellcheck="false" placeholder="https://...">
            </label>
            <label class="appearance-field">
              <span>暗色背景地址</span>
              <input v-model="darkBackgroundUrlModel" type="url" spellcheck="false" placeholder="https://...">
            </label>
          </div>
        </section>

        <section class="appearance-group">
          <div class="appearance-group__header">
            <h3>背景效果</h3>
            <p>调整壁纸本身的柔化和表面遮罩</p>
          </div>
          <div class="appearance-range-grid">
            <label class="appearance-range appearance-range--prominent">
              <span class="appearance-range__header">
                <strong>背景模糊</strong>
                <output>{{ backgroundBlurModel }}px</output>
              </span>
              <input v-model.number="backgroundBlurModel" type="range" min="0" max="40" step="1">
            </label>
            <label class="appearance-range appearance-range--prominent">
              <span class="appearance-range__header">
                <strong>背景遮罩</strong>
                <output>{{ backgroundOverlayModel }}%</output>
              </span>
              <input v-model.number="backgroundOverlayModel" type="range" min="0" max="100" step="1">
            </label>
          </div>
        </section>
      </div>
    </div>

    <footer class="appearance-panel__footer">
      <button class="appearance-reset-button" type="button" :disabled="appStore.isAppearanceAdmin ? false : !appStore.hasAppearanceOverrides" @click="appStore.resetAppearanceSettings()">
        <span class="material-symbols-rounded">restart_alt</span>
        <span>{{ appStore.isAppearanceAdmin ? '恢复默认（全站）' : '恢复后台外观' }}</span>
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.appearance-panel {
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: min(560px, calc(88vh - 104px));
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto auto;
}

.appearance-sidebar {
  position: sticky;
  top: -8px;
  z-index: 5;
  min-width: 0;
  padding-top: 8px;
  background: var(--md-sys-color-surface-container-high);
}

.appearance-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 14px;
  background: var(--md-sys-color-surface-container-high);
}

.appearance-tab {
  position: relative;
  display: inline-flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  padding: 0 8px;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: var(--md-sys-typescale-label-large-weight);
  line-height: var(--md-sys-typescale-label-large-line-height);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  cursor: pointer;
  transition:
    color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

  &::after {
    content: '';
    position: absolute;
    left: 18px;
    right: 18px;
    bottom: 0;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--md-sys-color-primary);
    opacity: 0;
    transform: scaleX(0.45);
    transition:
      opacity var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
      transform var(--md-app-motion-duration-short) var(--md-app-motion-easing-emphasized);
  }

  &:hover {
    color: var(--md-sys-color-on-surface);
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }

  &.is-active {
    color: var(--md-sys-color-primary);
    background: var(--md-sys-color-secondary-container);
  }

  &.is-active::after {
    opacity: 1;
    transform: scaleX(1);
  }

  .material-symbols-rounded {
    font-size: 20px;
  }
}

.appearance-tab-content {
  width: 100%;
  min-height: 0;
  min-width: 0;
  overflow: visible;
  padding: 20px 2px 16px;
}

.appearance-admin-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);

  .material-symbols-rounded {
    font-size: 20px;
  }
}

.appearance-tab-panel {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 0;
  animation: appearance-panel-enter var(--md-app-motion-duration-medium) var(--md-app-motion-easing-emphasized);
}

.appearance-group {
  display: grid;
  gap: 12px;
  padding: 0 0 22px;
}

.appearance-group + .appearance-group {
  padding-top: 20px;
}

.appearance-group:not(:last-child) {
  border-bottom: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 72%, transparent);
}

.appearance-group:last-child {
  padding-bottom: 0;
}

.appearance-group__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;

  h3 {
    margin: 0;
    color: var(--md-sys-color-on-surface);
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);
  }

  p {
    margin: 0;
    text-align: right;
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
  }
}

.appearance-segmented {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: 12px;
  background: var(--md-sys-color-surface-container-low);
}

.appearance-segmented__button {
  position: relative;
  display: inline-flex;
  min-height: 40px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-right: 1px solid var(--md-sys-color-outline-variant);
  padding: 0 8px;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: var(--md-sys-typescale-label-large-weight);
  line-height: var(--md-sys-typescale-label-large-line-height);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  cursor: pointer;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
  }

  > * {
    position: relative;
    z-index: 1;
  }

  &:hover::before {
    opacity: var(--md-app-state-hover);
  }

  &:last-child {
    border-right: 0;
  }

  &.is-active {
    color: var(--md-sys-color-on-secondary-container);
    background: var(--md-sys-color-secondary-container);
  }

  .material-symbols-rounded {
    font-size: 18px;
  }
}

.appearance-field-grid,
.appearance-range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.appearance-field,
.appearance-switch,
.appearance-range {
  display: grid;
  gap: 5px;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  font-weight: var(--md-sys-typescale-label-small-weight);
  line-height: var(--md-sys-typescale-label-small-line-height);
  letter-spacing: var(--md-sys-typescale-label-small-tracking);
}

.appearance-field--wide {
  grid-column: 1 / -1;
}

.appearance-switch--wide {
  grid-column: 1 / -1;
}

.appearance-field input,
.appearance-field select {
  width: 100%;
  min-height: 56px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 10px;
  padding: 0 10px;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface-container-lowest);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);
  outline: none;

  &:focus {
    border-color: var(--md-sys-color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent);
  }
}

.appearance-color-layout {
  display: grid;
  grid-template-columns: minmax(150px, 0.62fr) minmax(0, 1.38fr);
  gap: 8px;
  align-items: end;
}

.appearance-color-layout--seed {
  grid-template-columns: minmax(0, 1fr);
}

.appearance-color-input {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 6px;

  input[type='color'] {
    padding: 4px;
  }
}

.appearance-switch {
  min-height: 48px;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;

  input {
    position: relative;
    width: 52px;
    height: 32px;
    appearance: none;
    border: 2px solid transparent;
    border-radius: 999px;
    background: var(--md-sys-color-surface-variant);
    cursor: pointer;
    transition:
      background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
      border-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

    &::before {
      content: '';
      position: absolute;
      top: 6px;
      left: 6px;
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: var(--md-sys-color-outline);
      transition:
        width var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
        height var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
        transform var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
        background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
    }

    &:checked {
      border-color: var(--md-sys-color-primary);
      background: var(--md-sys-color-primary);
    }

    &:checked::before {
      width: 24px;
      height: 24px;
      background: var(--md-sys-color-on-primary);
      transform: translate(14px, -4px);
    }
  }

  > span {
    display: grid;
    gap: 2px;
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-body-medium-font);
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking);
  }

  strong {
    font-weight: var(--md-sys-typescale-label-large-weight);
  }

  small {
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
  }
}

.appearance-palette-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 8px;
}

.appearance-palette {
  position: relative;
  display: block;
  min-width: 0;
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 16px;
  padding: 4px;
  background: transparent;
  cursor: pointer;
  outline: none;
  transition:
    border-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    transform var(--md-app-motion-duration-short) var(--md-app-motion-easing-emphasized);

  &:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
    transform: scale(1.04);
  }

  &:focus-visible {
    box-shadow: 0 0 0 3px var(--md-sys-color-secondary-container);
  }

  &.is-active {
    border-color: var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
  }
}

.appearance-palette__swatches {
  display: grid;
  overflow: hidden;
  width: 100%;
  height: 100%;
  grid-template-columns: 3fr 2fr;
  grid-template-rows: repeat(2, 1fr);
  border-radius: 11px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-sys-color-outline) 32%, transparent);
}

.appearance-palette__swatch {
  &:first-child {
    grid-row: 1 / -1;
  }
}

.appearance-range {
  input {
    width: 100%;
    accent-color: var(--md-sys-color-primary);
  }
}

.appearance-range--prominent {
  gap: 6px;
  padding: 4px 0;
  transition: opacity var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

  &.is-disabled {
    opacity: 0.46;
  }

  input {
    height: 24px;
    margin: 0;
    cursor: pointer;
  }

  input:disabled {
    cursor: not-allowed;
  }
}

.appearance-range__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);

  strong {
    font-weight: var(--md-sys-typescale-label-large-weight);
  }

  output {
    min-width: 48px;
    color: var(--md-sys-color-primary);
    font-family: var(--md-app-number-font-family);
    font-weight: 600;
    text-align: right;
  }
}

.appearance-range__supporting {
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
}

.appearance-panel__footer {
  position: sticky;
  bottom: -24px;
  z-index: 4;
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
  border-top: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 72%, transparent);
  background: var(--md-sys-color-surface-container-high);
}

.appearance-reset-button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 999px;
  padding: 0 24px;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface-container-low);
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: var(--md-sys-typescale-label-large-weight);
  line-height: var(--md-sys-typescale-label-large-line-height);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  cursor: pointer;

  &:disabled {
    opacity: 0.46;
    cursor: not-allowed;
  }
}

@keyframes appearance-panel-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .appearance-panel {
    min-height: calc(88vh - 104px);
    grid-template-rows: auto auto auto;
  }

  .appearance-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-large);
    background: var(--md-sys-color-surface-container-high);
  }

  .appearance-tab {
    min-height: 48px;
    flex-direction: column;
    gap: 1px;
    font-size: var(--md-sys-typescale-label-medium-size);

    .material-symbols-rounded {
      font-size: 18px;
    }
  }

  .appearance-tab-content {
    padding: 16px 2px;
  }

  .appearance-group__header {
    display: grid;
    gap: 4px;

    p {
      text-align: left;
    }
  }

  .appearance-field-grid,
  .appearance-range-grid {
    grid-template-columns: 1fr;
  }

  .appearance-color-layout {
    grid-template-columns: 1fr;
  }

  .appearance-palette-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
  }

  .appearance-segmented__button {
    min-height: 40px;
    font-size: var(--md-sys-typescale-label-medium-size);
  }

  .appearance-panel__footer {
    bottom: -24px;
  }
}
</style>
