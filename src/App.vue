<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import Background from './components/Background.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import Provider from './components/Provider.vue'
import { useAppStore } from './stores/app'
import { destroyInitManager, initApp } from './utils/init'

const appStore = useAppStore()

// 计算页面容器的样式
const pageContainerStyle = computed(() => {
  if (appStore.fullWidth) {
    return {}
  }
  return {
    maxWidth: appStore.maxPageWidth,
    marginInline: 'auto',
  }
})

// 初始化应用：壳层立即展示，数据并行加载
onMounted(() => {
  void initApp().catch((error) => {
    console.error('[App] Initialization failed:', error)
  })
})

// 组件卸载时销毁 InitManager，防止内存泄漏
onUnmounted(() => {
  destroyInitManager()
})
</script>

<template>
  <Provider>
    <Background />
    <Header />
    <main class="min-h-screen overflow-hidden">
      <div :style="pageContainerStyle">
        <RouterView v-slot="{ Component }">
          <Transition
            enter-active-class="transition-[opacity,transform] duration-250 ease-out"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-[opacity,transform] duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-2"
            mode="out-in"
          >
            <KeepAlive :include="['HomeView']">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </div>
    </main>
    <Footer />
  </Provider>
</template>

<style scoped></style>
