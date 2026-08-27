<script setup lang="ts">
import type { PropType, Ref, VNodeChild } from 'vue'
import { computed, defineComponent, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { applyMaterialThemeTokens } from '@/utils/materialTheme'
import '@/utils/materialWeb'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  content: string
}

interface ModalState {
  id: number
  title?: string
  content?: () => VNodeChild
  size: 'medium' | 'large'
  closable: boolean
  closeOnEsc: boolean
  maskClosable: boolean
}

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.cardBlurRadius > 0)
const isScrolled = ref(false)
const toasts = ref<ToastItem[]>([])
const activeModal = ref<ModalState | null>(null)
const modalCard = ref<HTMLElement | null>(null)
const loadingBarVisible = ref(false)
let modalTrigger: HTMLElement | null = null
let toastId = 0
let modalId = 0

provide<Ref<boolean>>('isScrolled', isScrolled)

const ModalContentRenderer = defineComponent({
  props: {
    renderContent: {
      type: Function as PropType<() => VNodeChild>,
      required: false,
    },
  },
  setup(props) {
    return () => props.renderContent?.() ?? null
  },
})

const toastIcons: Record<ToastType, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
}

function pushToast(type: ToastType, content: string) {
  const id = ++toastId
  toasts.value.push({ id, type, content })
  window.setTimeout(() => {
    toasts.value = toasts.value.filter(item => item.id !== id)
  }, 3600)
}

function notificationText(options: { title?: string, content?: string }) {
  return [options.title, options.content].filter(Boolean).join('：')
}

async function closeModal() {
  activeModal.value = null
  await nextTick()
  modalTrigger?.focus()
  modalTrigger = null
}

function handleScrimClick() {
  if (activeModal.value?.maskClosable) {
    void closeModal()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && activeModal.value?.closeOnEsc) {
    void closeModal()
    return
  }

  if (event.key !== 'Tab' || !activeModal.value || !modalCard.value)
    return

  const focusable = Array.from(modalCard.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
  )).filter(element => !element.hasAttribute('hidden'))

  if (focusable.length === 0) {
    event.preventDefault()
    modalCard.value.focus()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function handleScroll() {
  isScrolled.value = window.scrollY > 0
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function setupMaterialTools() {
  window.$message = {
    success: content => pushToast('success', content),
    error: content => pushToast('error', content),
    warning: content => pushToast('warning', content),
    info: content => pushToast('info', content),
  }

  window.$modal = {
    create: (options) => {
      modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
      activeModal.value = {
        id: ++modalId,
        title: options.title,
        content: options.content as (() => VNodeChild) | undefined,
        size: options.size ?? 'medium',
        closable: options.closable ?? true,
        closeOnEsc: options.closeOnEsc ?? true,
        maskClosable: options.maskClosable ?? true,
      }
      void nextTick(() => {
        const preferredTarget = modalCard.value?.querySelector<HTMLElement>('[autofocus], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]')
        ;(preferredTarget ?? modalCard.value)?.focus()
      })
    },
    destroyAll: closeModal,
  }

  window.$loadingBar = {
    start: () => {
      loadingBarVisible.value = true
    },
    finish: () => {
      loadingBarVisible.value = false
    },
    error: () => {
      loadingBarVisible.value = false
      pushToast('error', '加载失败')
    },
  }

  const notificationApi = {
    create: (options: { title?: string, content?: string, type?: ToastType }) => {
      pushToast(options.type ?? 'info', notificationText(options))
    },
    success: (options: { title?: string, content?: string }) => pushToast('success', notificationText(options)),
    error: (options: { title?: string, content?: string }) => pushToast('error', notificationText(options)),
    warning: (options: { title?: string, content?: string }) => pushToast('warning', notificationText(options)),
    info: (options: { title?: string, content?: string }) => pushToast('info', notificationText(options)),
  }

  window.$notification = notificationApi
  window.$dialog = notificationApi
}

setupMaterialTools()

watch(
  () => appStore.materialThemeTokens,
  (tokens) => {
    applyMaterialThemeTokens(tokens)
  },
  { immediate: true },
)

watch(
  () => appStore.cardOpacity,
  (opacity) => {
    const root = document.documentElement
    root.style.setProperty('--md-app-card-surface-opacity', `${opacity}%`)
    root.style.setProperty('--md-app-card-surface-hover-opacity', `${Math.min(100, opacity + 6)}%`)
  },
  { immediate: true },
)

watch(
  isDark,
  (dark) => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
  },
  { immediate: true },
)

watch(
  [() => appStore.backgroundEnabled, isDark],
  ([enabled, dark]) => {
    const body = document.body
    if (enabled) {
      body.style.setProperty('background-color', 'transparent', 'important')
    }
    else {
      body.style.removeProperty('background-color')
      body.style.backgroundColor = dark ? 'var(--md-sys-color-background)' : 'var(--md-sys-color-background)'
    }
  },
  { immediate: true },
)

// 毛玻璃模式下给 body 打开关，让实色控件跟随半透明体系
watch(
  hasBackgroundBlur,
  (blur) => {
    document.body.classList.toggle('translucent', blur)
  },
  { immediate: true },
)

onMounted(() => {
  handleScroll()
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <slot />

  <Transition name="loading-bar">
    <div v-if="loadingBarVisible" class="material-loading-bar">
      <md-linear-progress indeterminate />
    </div>
  </Transition>

  <Transition name="fab">
    <button
      v-if="isScrolled"
      class="material-back-top"
      :class="{ 'md-surface-glass': hasBackgroundBlur }"
      type="button"
      aria-label="返回顶部"
      @click="scrollToTop"
    >
      <span class="material-symbols-rounded">keyboard_arrow_up</span>
    </button>
  </Transition>

  <Teleport to="body">
    <div class="material-snackbar-host" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="snackbar">
        <div v-for="toast in toasts" :key="toast.id" class="material-snackbar" :class="`material-snackbar--${toast.type}`">
          <span class="material-symbols-rounded material-snackbar__icon">{{ toastIcons[toast.type] }}</span>
          <span>{{ toast.content }}</span>
        </div>
      </TransitionGroup>
    </div>

    <Transition name="modal">
      <div v-if="activeModal" class="material-modal-scrim" @click.self="handleScrimClick">
        <section
          ref="modalCard"
          class="material-modal-card"
          :class="`material-modal-card--${activeModal.size}`"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="activeModal.title ? `material-modal-title-${activeModal.id}` : undefined"
          :aria-label="activeModal.title ? undefined : '对话框'"
          tabindex="-1"
        >
          <header v-if="activeModal.title || activeModal.closable" class="material-modal-card__header">
            <h2 v-if="activeModal.title" :id="`material-modal-title-${activeModal.id}`" class="material-modal-card__title">
              {{ activeModal.title }}
            </h2>
            <button v-if="activeModal.closable" class="material-icon-button material-modal-card__close" type="button" aria-label="关闭" @click="closeModal">
              <span class="material-symbols-rounded">close</span>
            </button>
          </header>
          <div class="material-modal-card__content">
            <ModalContentRenderer v-if="activeModal.content" :render-content="activeModal.content" />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.material-loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
}

.material-back-top {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 9999;
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 16px;
  color: var(--md-sys-color-on-primary-container);
  background: var(--md-sys-color-primary-container);
  box-shadow: var(--md-app-elevation-2);
  cursor: pointer;
  transition:
    box-shadow var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    background-color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    color var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

  &:hover {
    box-shadow: var(--md-app-elevation-3);
  }
}

.material-back-top.md-surface-glass {
  color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-app-elevation-3);
}

.material-snackbar-host {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 11000;
  display: flex;
  max-width: min(420px, calc(100vw - 32px));
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.material-snackbar {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  color: var(--md-sys-color-inverse-on-surface);
  background: var(--md-sys-color-inverse-surface);
  box-shadow: var(--md-app-elevation-2);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  font-weight: var(--md-sys-typescale-body-medium-weight);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);
  pointer-events: auto;
}

.material-snackbar--success .material-snackbar__icon {
  color: var(--md-chart-success);
}

.material-snackbar--error .material-snackbar__icon {
  color: #ffb4ab;
}

.material-snackbar--warning .material-snackbar__icon {
  color: var(--md-chart-warning);
}

.material-snackbar--info .material-snackbar__icon {
  color: var(--md-sys-color-inverse-primary);
}

.material-modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 10500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--md-sys-color-scrim) 42%, transparent);
}

.material-modal-card {
  width: min(720px, 100%);
  max-height: min(80vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 28px;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface-container-high);
  box-shadow: var(--md-app-elevation-3);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  font-weight: var(--md-sys-typescale-body-medium-weight);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);
}

.material-modal-card--large {
  width: min(1120px, 100%);
  max-height: min(90vh, 900px);
}

.material-modal-card__header {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 8px 24px;
}

.material-modal-card__title {
  margin: 0;
  font-family: var(--md-sys-typescale-headline-small-font);
  font-size: var(--md-sys-typescale-headline-small-size);
  font-weight: var(--md-sys-typescale-headline-small-weight);
  line-height: var(--md-sys-typescale-headline-small-line-height);
  letter-spacing: var(--md-sys-typescale-headline-small-tracking);
}

.material-modal-card__close {
  flex-shrink: 0;
}

.material-modal-card__content {
  min-height: 0;
  overflow: auto;
  padding: 8px 24px 24px;
}

.loading-bar-enter-active,
.loading-bar-leave-active,
.fab-enter-active,
.fab-leave-active,
.modal-enter-active,
.modal-leave-active,
.snackbar-enter-active,
.snackbar-leave-active {
  transition:
    opacity var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard),
    transform var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

.loading-bar-enter-from,
.loading-bar-leave-to,
.fab-enter-from,
.fab-leave-to,
.modal-enter-from,
.modal-leave-to,
.snackbar-enter-from,
.snackbar-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 640px) {
  .material-back-top {
    right: 16px;
    bottom: 16px;
  }

  .material-snackbar-host {
    left: 16px;
    right: 16px;
    bottom: 16px;
  }

  .material-modal-scrim {
    padding: 12px;
    align-items: flex-end;
  }

  .material-modal-card {
    max-height: 88vh;
    border-radius: 28px 28px 0 0;
  }

  .material-modal-card--large {
    max-height: 88vh;
  }
}
</style>
