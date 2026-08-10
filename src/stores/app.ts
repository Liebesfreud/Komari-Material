import type { MeInfo, PublicSettings } from '@/utils/api'
import type { ByteDecimalsConfig, UptimeFormat } from '@/utils/helper'
import type { MaterialDensity, MonetColorMode } from '@/utils/materialTheme'
import { usePreferredDark, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { ApiError, getSharedApi } from '@/utils/api'
import {
  buildMaterialThemeTokens,
  DEFAULT_MATERIAL_SEED_COLOR,
  extractMaterialSeedColorFromImageUrl,
  isMonetColorMode,
  normalizeHexColor,
  resolveMonetPaletteSeed,
} from '@/utils/materialTheme'

type ThemeMode = 'auto' | 'light' | 'dark'
type Lang = 'zh-CN' | 'en-US'
type NodeViewMode = 'card' | 'list' | 'compact-list'
type RpcTransportMode = 'websocket' | 'http'
type AlertType = 'default' | 'info' | 'success' | 'warning' | 'error'
type BackgroundType = 'image' | 'video'
type CardSurfaceStyle = 'solid' | 'translucent'
type TopDataPanel = 'current' | 'legacy'

interface AppearanceSettingsOverrides {
  monetColorMode?: MonetColorMode
  monetPalette?: string
  materialSeedColor?: string
  materialDensity?: MaterialDensity
  topDataPanel?: TopDataPanel
  cardSurfaceStyle?: CardSurfaceStyle
  cardOpacity?: number
  fullWidth?: boolean
  maxPageWidth?: string
  hiddenGroupsFromAll?: string
  backgroundEnabled?: boolean
  backgroundType?: BackgroundType
  lightBackgroundUrl?: string
  darkBackgroundUrl?: string
  backgroundBlur?: number
  backgroundOverlay?: number
}

const DEFAULT_FONT_FAMILY = '"Roboto Variable", "Noto Sans SC Variable", sans-serif'
const DEFAULT_NUMBER_FONT_FAMILY = '"Roboto Variable", "Noto Sans SC Variable", sans-serif'
const LEGACY_FONT_NAMES = ['MiSans', 'TCloud Number']
const DEFAULT_DATA_UPDATE_INTERVAL = 1
const MAX_DATA_UPDATE_INTERVAL = 60
const MAX_BACKGROUND_BLUR = 40

/** 默认的字节精度配置 */
const DEFAULT_BYTE_DECIMALS: ByteDecimalsConfig = {
  B: 0,
  KB: 0,
  MB: 1,
  GB: 1,
  TB: 2,
}

function parseHiddenGroupsFromAll(value: unknown): string[] {
  const sourceValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,，;；|]+/)
      : []

  const groups = sourceValues
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean)

  return Array.from(new Set(groups))
}

function normalizeFontFamily(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim())
    return fallback

  return LEGACY_FONT_NAMES.some(fontName => value.includes(fontName))
    ? fallback
    : value.trim()
}

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return fallback

  return Math.min(max, Math.max(min, value))
}

function isValidPageWidth(value: string): boolean {
  const cssApi = typeof CSS !== 'undefined' ? CSS : null
  if (cssApi?.supports)
    return cssApi.supports('max-width', value)

  return /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc|%))$/i.test(value)
}

function normalizePageWidth(value: unknown, fallback = '1800px'): string {
  if (typeof value !== 'string')
    return fallback

  const normalized = value.trim()
  return normalized && isValidPageWidth(normalized) ? normalized : fallback
}

function parseThemeSettings(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    }
    catch {
      return {}
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/** 稳定序列化，保证对象键顺序不影响签名结果 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(',')}]`

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
  }

  return JSON.stringify(value)
}

/** 计算后台 theme_settings 的签名，用于检测后台配置是否变更 */
function getManagedSettingsSignature(input: unknown): string {
  return stableStringify(input ?? {})
}

const useAppStore = defineStore('app', () => {
  const loading = ref<boolean>(true)

  // 使用 VueUse 的 useStorageAsync 实现自动持久化
  const themeMode = useStorageAsync<ThemeMode>('themeMode', 'auto', localStorage)
  const lang = ref<Lang>('zh-CN')
  const publicSettings = ref<PublicSettings>()
  const userInfo = ref<MeInfo>()
  const nodeSelectedGroup = useStorageAsync<string>('nodeSelectedGroup', 'all', localStorage)
  const appearanceSettingsOverrides = useStorageAsync<AppearanceSettingsOverrides>('appearanceSettingsOverrides', {}, localStorage)
  // 访客本地覆盖写入时记录的后台 theme_settings 签名，用于后台变更时自动失效本地覆盖
  const localOverrideBaseSignature = useStorageAsync<string | null>('appearanceOverrideBaseSignature', null, localStorage)
  // 当前后台 theme_settings 的签名（由 publicSettings 派生）
  const managedSettingsSignature = ref<string>('')
  const optimisticManagedSettings = ref<Record<string, unknown> | null>(null)
  let queuedSave: Record<string, unknown> | null = null
  let isSaving = false
  let managedSettingsDraft: Record<string, unknown> = {}
  let persistedManagedSettings: Record<string, unknown> = {}
  const isLoggedIn = ref<boolean>(false)
  const connectionError = ref<boolean>(false)
  const requireLogin = ref<boolean>(false)
  const wallpaperSeedColor = ref<string | null>(null)
  const wallpaperSeedSourceUrl = ref<string>('')
  const wallpaperSeedError = ref<string | null>(null)

  // 首页滚动位置记忆
  const homeScrollPosition = ref<number>(0)

  // 使用 null 表示未设置，等待主题配置加载后决定
  const storedViewMode = useStorageAsync<NodeViewMode | null>('nodeViewMode', null, localStorage)

  const managedThemeSettings = computed<Record<string, unknown>>(() => (
    optimisticManagedSettings.value ?? parseThemeSettings(publicSettings.value?.theme_settings)
  ))

  const themeSettings = computed<Record<string, unknown>>(() => ({
    ...managedThemeSettings.value,
    ...appearanceSettingsOverrides.value,
  }))

  // 计算属性：从主题配置获取默认视图模式
  const defaultViewMode = computed<NodeViewMode>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.defaultViewMode === 'string') {
      const mode = settings.defaultViewMode
      if (mode === 'card' || mode === 'list' || mode === 'compact-list') {
        return mode
      }
    }
    return 'card'
  })

  // 校验视图模式是否为合法值
  function isValidViewMode(value: string | null): value is NodeViewMode {
    return value === 'card' || value === 'list' || value === 'compact-list'
  }

  // 当前实际使用的视图模式
  const nodeViewMode = computed<NodeViewMode>({
    get: () => {
      // 校验 storedViewMode 是否为合法值，非法值时使用默认值
      if (storedViewMode.value !== null && isValidViewMode(storedViewMode.value)) {
        return storedViewMode.value
      }
      return defaultViewMode.value
    },
    set: (val) => {
      storedViewMode.value = val
    },
  })

  // 计算属性：从主题配置获取 RPC 连接模式
  const rpcTransportMode = computed<RpcTransportMode>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.rpcTransportMode === 'string') {
      const mode = settings.rpcTransportMode
      if (mode === 'websocket' || mode === 'http') {
        return mode
      }
    }
    return 'websocket'
  })

  // 后台 number 字段没有原生范围校验，统一在 store 入口兜底。
  const dataUpdateInterval = computed<number>(() => {
    return clampFiniteNumber(
      themeSettings.value.dataUpdateInterval,
      DEFAULT_DATA_UPDATE_INTERVAL,
      DEFAULT_DATA_UPDATE_INTERVAL,
      MAX_DATA_UPDATE_INTERVAL,
    )
  })

  // 计算属性：从主题配置获取是否显示登录按钮
  const showLoginButton = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.showLoginButton === 'boolean') {
      return settings.showLoginButton
    }
    return true
  })

  // 计算属性：页面布局配置
  const fullWidth = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.fullWidth === 'boolean') {
      return settings.fullWidth
    }
    return false
  })

  const maxPageWidth = computed<string>(() => {
    return normalizePageWidth(themeSettings.value.maxPageWidth)
  })

  const manualMaterialSeedColor = computed<string>(() => {
    const settings = themeSettings.value
    if (!settings)
      return DEFAULT_MATERIAL_SEED_COLOR

    const explicitSeed = settings.materialSeedColor
    if (typeof explicitSeed === 'string' && explicitSeed.trim()) {
      return normalizeHexColor(explicitSeed)
    }

    const legacyPrimary = settings.lightPrimaryColor || settings.darkPrimaryColor
    return normalizeHexColor(legacyPrimary, DEFAULT_MATERIAL_SEED_COLOR)
  })

  const monetColorMode = computed<MonetColorMode>(() => {
    const settings = themeSettings.value
    const mode = settings?.monetColorMode
    return isMonetColorMode(mode) ? mode : 'seed'
  })

  const monetPaletteSeedColor = computed<string>(() => {
    const settings = themeSettings.value
    return resolveMonetPaletteSeed(settings?.monetPalette, manualMaterialSeedColor.value)
  })

  const materialSeedColor = computed<string>(() => {
    if (monetColorMode.value === 'wallpaper') {
      return wallpaperSeedColor.value ?? monetPaletteSeedColor.value
    }

    if (monetColorMode.value === 'palette') {
      return monetPaletteSeedColor.value
    }

    return manualMaterialSeedColor.value
  })

  const materialDensity = computed<MaterialDensity>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.materialDensity === 'string') {
      const density = settings.materialDensity
      if (density === 'compact' || density === 'comfortable') {
        return density
      }
    }
    return 'compact'
  })

  const topDataPanel = computed<TopDataPanel>(() => {
    return themeSettings.value.topDataPanel === 'legacy' ? 'legacy' : 'current'
  })

  const cardSurfaceStyle = computed<CardSurfaceStyle>(() => {
    const style = themeSettings.value.cardSurfaceStyle
    return style === 'translucent' ? style : 'solid'
  })

  const cardOpacity = computed<number>(() => {
    const value = themeSettings.value.cardOpacity
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.min(95, Math.max(50, value))
    }
    return 80
  })

  const fontFamily = computed<string>(() => {
    return normalizeFontFamily(themeSettings.value.fontFamily, DEFAULT_FONT_FAMILY)
  })

  // 计算属性：卡片进度条布局配置
  const cardProgressLayout = computed<'1col' | '2col'>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.cardProgressLayout === 'string') {
      const layout = settings.cardProgressLayout
      if (layout === '1col' || layout === '2col') {
        return layout
      }
    }
    return '2col'
  })

  // 计算属性：数字字体配置
  const numberFontFamily = computed<string>(() => {
    return normalizeFontFamily(themeSettings.value.numberFontFamily, DEFAULT_NUMBER_FONT_FAMILY)
  })

  // 计算属性：单分组时是否隐藏 Tab
  const hideSingleGroupTab = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.hideSingleGroupTab === 'boolean') {
      return settings.hideSingleGroupTab
    }
    return true
  })

  const hiddenGroupsFromAllText = computed<string>(() => {
    const value = themeSettings.value.hiddenGroupsFromAll
    if (typeof value === 'string') {
      return value
    }
    return parseHiddenGroupsFromAll(value).join(', ')
  })

  const hiddenGroupsFromAll = computed<string[]>(() => {
    return parseHiddenGroupsFromAll(themeSettings.value.hiddenGroupsFromAll)
  })

  // 计算属性：长条卡片视图状态显示样式（tag 或 badge）
  const listStatusStyle = computed<'tag' | 'badge'>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.listStatusStyle === 'string') {
      const style = settings.listStatusStyle
      if (style === 'tag' || style === 'badge') {
        return style
      }
    }
    return 'tag'
  })

  // 计算属性：是否显示延迟图表按钮
  const showPingChartButton = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.showPingChartButton === 'boolean') {
      return settings.showPingChartButton
    }
    return true
  })

  // 计算属性：是否显示节点延迟与丢包摘要
  const showNodePingStats = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.showNodePingStats === 'boolean') {
      return settings.showNodePingStats
    }
    return true
  })

  // 计算属性：是否使用 Tag 组件包裹运行时间
  const uptimeTagWrap = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.uptimeTagWrap === 'boolean') {
      return settings.uptimeTagWrap
    }
    return false
  })

  // 计算属性：运行时间格式配置
  const uptimeFormat = computed<UptimeFormat>(() => {
    const settings = themeSettings.value
    const validFormats: UptimeFormat[] = ['day', 'hour', 'minute', 'second']

    if (settings && typeof settings.uptimeFormat === 'string') {
      const format = settings.uptimeFormat as UptimeFormat
      if (validFormats.includes(format)) {
        return format
      }
    }
    return 'day'
  })

  // 计算属性：亮色模式卡片高对比度
  const lightCardContrast = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.lightCardContrast === 'boolean') {
      return settings.lightCardContrast
    }
    return false
  })

  // 计算属性：Card 视图流量统计上下行分离颜色
  const trafficSplitColor = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.trafficSplitColor === 'boolean') {
      return settings.trafficSplitColor
    }
    return true
  })

  // 计算属性：字节格式化精度配置
  const byteDecimals = computed<ByteDecimalsConfig>(() => {
    const settings = themeSettings.value
    const config: ByteDecimalsConfig = { ...DEFAULT_BYTE_DECIMALS }

    if (!settings) {
      return config
    }

    // 解析各个单位的精度配置
    const parseDecimal = (key: string): number | undefined => {
      const value = settings[key]
      if (value === -1 || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6)) {
        return value
      }
      return undefined
    }

    config.B = parseDecimal('byteDecimalsB') ?? config.B
    config.KB = parseDecimal('byteDecimalsKB') ?? config.KB
    config.MB = parseDecimal('byteDecimalsMB') ?? config.MB
    config.GB = parseDecimal('byteDecimalsGB') ?? config.GB
    config.TB = parseDecimal('byteDecimalsTB') ?? config.TB

    return config
  })

  // 计算属性：公告配置
  const alertEnabled = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.alertEnabled === 'boolean') {
      return settings.alertEnabled
    }
    return false
  })

  const alertType = computed<AlertType>(() => {
    const settings = themeSettings.value
    const validTypes: AlertType[] = ['default', 'info', 'success', 'warning', 'error']

    if (settings && typeof settings.alertType === 'string') {
      const type = settings.alertType as AlertType
      if (validTypes.includes(type)) {
        return type
      }
    }
    return 'info'
  })

  const alertTitle = computed<string>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.alertTitle === 'string') {
      return settings.alertTitle
    }
    return ''
  })

  const alertContent = computed<string>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.alertContent === 'string') {
      return settings.alertContent
    }
    return ''
  })

  // 计算属性：ICP 备案配置
  const icpEnabled = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.icpEnabled === 'boolean') {
      return settings.icpEnabled
    }
    return false
  })

  const icpNumber = computed<string>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.icpNumber === 'string') {
      return settings.icpNumber
    }
    return ''
  })

  const icpUrl = computed<string>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.icpUrl === 'string' && settings.icpUrl.trim()) {
      return settings.icpUrl.trim()
    }
    return 'https://beian.miit.gov.cn/'
  })

  // 计算属性：公安备案配置
  const policeEnabled = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.policeEnabled === 'boolean') {
      return settings.policeEnabled
    }
    return false
  })

  const policeNumber = computed<string>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.policeNumber === 'string') {
      return settings.policeNumber
    }
    return ''
  })

  const policeUrl = computed<string>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.policeUrl === 'string' && settings.policeUrl.trim()) {
      return settings.policeUrl.trim()
    }
    return ''
  })

  // 计算属性：自定义背景配置
  const backgroundEnabled = computed<boolean>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.backgroundEnabled === 'boolean') {
      return settings.backgroundEnabled
    }
    return false
  })

  const backgroundType = computed<'image' | 'video'>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.backgroundType === 'string') {
      const type = settings.backgroundType
      if (type === 'image' || type === 'video') {
        return type
      }
    }
    return 'image'
  })

  const lightBackgroundUrl = computed<string>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.lightBackgroundUrl === 'string') {
      return settings.lightBackgroundUrl.trim()
    }
    return ''
  })

  const darkBackgroundUrl = computed<string>(() => {
    const settings = themeSettings.value
    if (settings && typeof settings.darkBackgroundUrl === 'string') {
      return settings.darkBackgroundUrl.trim()
    }
    return ''
  })

  const backgroundBlur = computed<number>(() => {
    return clampFiniteNumber(themeSettings.value.backgroundBlur, 0, 0, MAX_BACKGROUND_BLUR)
  })

  const backgroundOverlay = computed<number>(() => {
    return clampFiniteNumber(themeSettings.value.backgroundOverlay, 0, 0, 100)
  })

  // 半透明卡片使用独立的背景模糊，确保壁纸清晰度为 0 时仍有足够的文字可读性。
  const cardBlurRadius = computed<number>(() => {
    if (backgroundEnabled.value && cardSurfaceStyle.value === 'translucent') {
      return Math.max(12, backgroundBlur.value + 8)
    }
    return 0
  })

  // 当 publicSettings 加载后：1) 视图模式回填默认值 2) 后台 theme_settings 变更时自动失效访客本地覆盖
  watch(publicSettings, (settings) => {
    const rawThemeSettings = parseThemeSettings(settings?.theme_settings)
    const nextSignature = getManagedSettingsSignature(rawThemeSettings)
    managedSettingsSignature.value = nextSignature

    if (!isSaving && !queuedSave) {
      managedSettingsDraft = rawThemeSettings
      persistedManagedSettings = rawThemeSettings
      optimisticManagedSettings.value = null
    }

    // 仅当后台有配置、本地有覆盖、且签名与访客写入时不一致 -> 清空本地覆盖
    // 避免访客旧设置覆盖管理员的新意图；后台为空时不触发，避免管理员刚清空后台时误清
    if (
      Object.keys(rawThemeSettings).length > 0
      && Object.keys(appearanceSettingsOverrides.value).length > 0
      && localOverrideBaseSignature.value !== null
      && localOverrideBaseSignature.value !== nextSignature
    ) {
      appearanceSettingsOverrides.value = {}
      localOverrideBaseSignature.value = null
    }

    if (settings && !isValidViewMode(storedViewMode.value)) {
      // 触发 computed setter，会自动保存到 localStorage
      storedViewMode.value = defaultViewMode.value
    }
  }, { immediate: true })

  // 使用 VueUse 的 usePreferredDark 检测系统主题偏好
  const prefersDark = usePreferredDark()

  // 计算当前是否为暗色模式
  const isDark = computed(() => {
    if (themeMode.value === 'auto') {
      return prefersDark.value
    }
    return themeMode.value === 'dark'
  })

  const materialThemeTokens = computed(() => {
    return buildMaterialThemeTokens(
      materialSeedColor.value,
      isDark.value,
      materialDensity.value,
      {
        fontFamily: fontFamily.value,
        numberFontFamily: numberFontFamily.value,
      },
    )
  })

  // 计算属性：当前主题模式下的背景 URL
  const currentBackgroundUrl = computed<string>(() => {
    if (isDark.value) {
      return darkBackgroundUrl.value
    }
    return lightBackgroundUrl.value
  })

  const wallpaperSeedCache = new Map<string, string>()
  let wallpaperSeedRequestId = 0

  watch(
    [monetColorMode, currentBackgroundUrl, backgroundType],
    async ([mode, url, type]) => {
      const requestId = ++wallpaperSeedRequestId

      if (mode !== 'wallpaper' || type !== 'image' || !url) {
        wallpaperSeedColor.value = null
        wallpaperSeedSourceUrl.value = ''
        wallpaperSeedError.value = null
        return
      }

      const cachedSeed = wallpaperSeedCache.get(url)
      if (cachedSeed) {
        wallpaperSeedColor.value = cachedSeed
        wallpaperSeedSourceUrl.value = url
        wallpaperSeedError.value = null
        return
      }

      try {
        const seedColor = await extractMaterialSeedColorFromImageUrl(url)
        if (requestId !== wallpaperSeedRequestId) {
          return
        }

        wallpaperSeedCache.set(url, seedColor)
        wallpaperSeedColor.value = seedColor
        wallpaperSeedSourceUrl.value = url
        wallpaperSeedError.value = null
      }
      catch (error) {
        if (requestId !== wallpaperSeedRequestId) {
          return
        }

        wallpaperSeedColor.value = null
        wallpaperSeedSourceUrl.value = url
        wallpaperSeedError.value = error instanceof Error ? error.message : 'Wallpaper color extraction failed'
      }
    },
    { immediate: true },
  )

  const hasAppearanceOverrides = computed(() => Object.keys(appearanceSettingsOverrides.value).length > 0)

  // 登录用户视为管理员，外观改动回写后台；否则只写本地覆盖
  const isAppearanceAdmin = computed(() => isLoggedIn.value)

  function syncPublicThemeSettings(value: Record<string, unknown>) {
    if (!publicSettings.value)
      return

    publicSettings.value = {
      ...publicSettings.value,
      theme_settings: value,
    }
  }

  /**
   * 管理员态回写后台 theme_settings
   * @param patch 待合并的增量（merge 模式）或整体替换值（replace 模式）
   * @param mode merge=与现有后台配置合并；replace=整体替换（用于清空）
   */
  async function persistManagedSettings(
    patch: Record<string, unknown>,
    mode: 'merge' | 'replace' = 'merge',
  ) {
    const nextRaw = mode === 'replace' ? { ...patch } : { ...managedSettingsDraft, ...patch }
    managedSettingsDraft = nextRaw
    optimisticManagedSettings.value = nextRaw
    appearanceSettingsOverrides.value = {}
    localOverrideBaseSignature.value = null
    queuedSave = nextRaw

    if (isSaving)
      return

    isSaving = true
    try {
      while (queuedSave) {
        const value = queuedSave
        queuedSave = null
        try {
          const theme = publicSettings.value?.theme ?? ''
          await getSharedApi().updateThemeSettings(theme, value)
          persistedManagedSettings = value
          managedSettingsSignature.value = getManagedSettingsSignature(value)
        }
        catch (error) {
          if (error instanceof ApiError && (error.code === 401 || error.code === 403)) {
            isLoggedIn.value = false
            window.$message?.error('登录状态已失效，主题设置未保存')
          }
          else {
            console.error('[appStore] 保存主题设置失败:', error)
            window.$message?.error('主题设置保存失败，请稍后重试')
          }
          queuedSave = null
          break
        }
      }
    }
    finally {
      managedSettingsDraft = persistedManagedSettings
      optimisticManagedSettings.value = null
      syncPublicThemeSettings(persistedManagedSettings)
      isSaving = false
    }
  }

  function updateAppearanceSetting<K extends keyof AppearanceSettingsOverrides>(
    key: K,
    value: AppearanceSettingsOverrides[K],
  ) {
    const patch = { [key]: value } as Record<string, unknown>

    if (isAppearanceAdmin.value) {
      // 管理员：回写后台，全站生效
      persistManagedSettings(patch)
      return
    }

    // 访客：写本地覆盖，并记录当前后台签名
    appearanceSettingsOverrides.value = {
      ...appearanceSettingsOverrides.value,
      [key]: value,
    }
    localOverrideBaseSignature.value = managedSettingsSignature.value
  }

  function clearAppearanceSetting(key: keyof AppearanceSettingsOverrides) {
    if (isAppearanceAdmin.value) {
      // 管理员：从后台 theme_settings 中移除该 key（用 replace 模式发送剔除后的完整对象）
      const currentRaw = { ...managedSettingsDraft }
      delete currentRaw[key]
      persistManagedSettings(currentRaw, 'replace')
      return
    }

    const nextSettings = { ...appearanceSettingsOverrides.value }
    delete nextSettings[key]
    appearanceSettingsOverrides.value = nextSettings
  }

  function resetAppearanceSettings() {
    if (isAppearanceAdmin.value) {
      // 管理员：清空后台 theme_settings，全站回到 manifest 默认
      persistManagedSettings({}, 'replace')
      return
    }

    // 访客：清本地覆盖
    appearanceSettingsOverrides.value = {}
    localOverrideBaseSignature.value = null
  }

  function updateThemeMode(mode?: ThemeMode) {
    if (mode) {
      themeMode.value = mode
      return
    }

    const nextMode: Record<ThemeMode, ThemeMode> = {
      auto: 'light',
      light: 'dark',
      dark: 'auto',
    }

    themeMode.value = nextMode[themeMode.value]
  }

  function updateLang(newLang: Lang) {
    lang.value = newLang
  }

  function setUserInfo(info: MeInfo) {
    userInfo.value = info
    isLoggedIn.value = info.logged_in
  }

  function clearUserInfo() {
    userInfo.value = undefined
    isLoggedIn.value = false
  }

  return {
    loading,
    themeMode,
    isDark,
    lang,
    nodeSelectedGroup,
    nodeViewMode,
    defaultViewMode,
    rpcTransportMode,
    dataUpdateInterval,
    showLoginButton,
    fullWidth,
    maxPageWidth,
    themeSettings,
    appearanceSettingsOverrides,
    hasAppearanceOverrides,
    isAppearanceAdmin,
    manualMaterialSeedColor,
    monetColorMode,
    monetPaletteSeedColor,
    materialSeedColor,
    wallpaperSeedColor,
    wallpaperSeedSourceUrl,
    wallpaperSeedError,
    materialDensity,
    topDataPanel,
    cardSurfaceStyle,
    cardOpacity,
    fontFamily,
    materialThemeTokens,
    cardProgressLayout,
    numberFontFamily,
    hideSingleGroupTab,
    hiddenGroupsFromAllText,
    hiddenGroupsFromAll,
    listStatusStyle,
    showPingChartButton,
    showNodePingStats,
    uptimeTagWrap,
    uptimeFormat,
    lightCardContrast,
    trafficSplitColor,
    byteDecimals,
    alertEnabled,
    alertType,
    alertTitle,
    alertContent,
    icpEnabled,
    icpNumber,
    icpUrl,
    policeEnabled,
    policeNumber,
    policeUrl,
    backgroundEnabled,
    backgroundType,
    lightBackgroundUrl,
    darkBackgroundUrl,
    currentBackgroundUrl,
    backgroundBlur,
    backgroundOverlay,
    cardBlurRadius,
    isLoggedIn,
    userInfo,
    publicSettings,
    connectionError,
    requireLogin,
    homeScrollPosition,
    updateAppearanceSetting,
    clearAppearanceSetting,
    resetAppearanceSettings,
    updateThemeMode,
    updateLang,
    setUserInfo,
    clearUserInfo,
  }
})

export { useAppStore }
