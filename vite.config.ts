import type { Plugin, ProxyOptions } from 'vite'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

import { defineConfig, loadEnv } from 'vite'

import vueDevTools from 'vite-plugin-vue-devtools'

// 使用 createRequire 支持 CommonJS 模块
const require = createRequire(import.meta.url)
const fs = require('node:fs')
const archiver = require('archiver')

/**
 * 获取当前 Git commit hash（短格式）
 */
function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  }
  catch {
    return 'unknown'
  }
}

function createKomariProxy(proxyTarget: string): Record<string, ProxyOptions> {
  const targetOrigin = new URL(proxyTarget).origin
  const rewriteOrigin = (proxyReq: { setHeader: (name: string, value: string) => void }) => {
    proxyReq.setHeader('origin', targetOrigin)
    proxyReq.setHeader('referer', `${targetOrigin}/`)
  }

  const proxyOptions: ProxyOptions = {
    target: proxyTarget,
    changeOrigin: true,
    secure: false,
    ws: true,
    cookieDomainRewrite: '',
    configure: (proxy) => {
      proxy.on('proxyReq', rewriteOrigin)
      proxy.on('proxyReqWs', rewriteOrigin)
    },
  }

  return {
    '/api': proxyOptions,
    '/rpc2': proxyOptions,
  }
}

function injectMaterialSymbolsFontHints(distDir: string) {
  const assetsDir = resolve(distDir, 'assets')
  const indexHtmlPath = resolve(distDir, 'index.html')

  if (!existsSync(assetsDir) || !existsSync(indexHtmlPath)) {
    return
  }

  const assetFiles = fs.readdirSync(assetsDir) as string[]
  const materialSymbolsFont = assetFiles.find(file => /^material-symbols-rounded-.+\.woff2$/.test(file))

  if (!materialSymbolsFont) {
    console.warn('[material-symbols-font] Material Symbols font asset not found, skipping preload injection')
    return
  }

  const fontHref = `/assets/${materialSymbolsFont}`
  const preloadLink = `<link rel="preload" href="${fontHref}" as="font" type="font/woff2" crossorigin>`
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8') as string

  if (indexHtml.includes(fontHref)) {
    return
  }

  fs.writeFileSync(indexHtmlPath, indexHtml.replace('</head>', `    ${preloadLink}\n  </head>`))
}

/**
 * Vite 插件：构建后打包 Komari 主题 Zip
 *
 * 生成符合 Komari 标准的主题包结构：
 * theme.zip
 * ├── komari-theme.json    # 主题配置文件
 * ├── preview.png          # 主题预览图
 * └── dist/                # 构建输出目录
 *     ├── index.html
 *     └── ...
 */
function komariThemeZip(): Plugin {
  return {
    name: 'komari-theme-zip',
    apply: 'build',
    closeBundle: async () => {
      const commitHash = getCommitHash()
      const zipFileName = `komari-theme-material-build-${commitHash}.zip`
      const distDir = resolve(__dirname, 'dist')
      const themeJsonPath = resolve(__dirname, 'komari-theme.json')
      const previewPath = resolve(__dirname, 'docs/preview.png')
      const outputPath = resolve(__dirname, zipFileName)

      if (!existsSync(distDir)) {
        console.log('[komari-theme-zip] dist directory not found, skipping zip creation')
        return
      }

      if (existsSync(outputPath)) {
        fs.rmSync(outputPath, { force: true })
      }

      // public/ is copied verbatim by Vite; keep repository-only guidance out of releases.
      const publicImagesGuidePath = resolve(distDir, 'images/AGENTS.md')
      if (existsSync(publicImagesGuidePath)) {
        fs.rmSync(publicImagesGuidePath, { force: true })
      }

      injectMaterialSymbolsFontHints(distDir)
      fs.copyFileSync(resolve(__dirname, 'src/assets/fonts/LICENSE.txt'), resolve(distDir, 'assets/material-symbols-LICENSE.txt'))

      const output = fs.createWriteStream(outputPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      return new Promise((resolve, reject) => {
        output.on('error', (err: Error) => {
          console.error('[komari-theme-zip] Output error:', err)
          reject(err)
        })

        output.on('close', () => {
          const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2)
          console.log(`[komari-theme-zip] Created ${zipFileName} (${sizeMB} MB)`)
          resolve(undefined)
        })

        archive.on('error', (err: Error) => {
          console.error('[komari-theme-zip] Error:', err)
          reject(err)
        })

        archive.pipe(output)

        if (existsSync(themeJsonPath)) {
          archive.file(themeJsonPath, { name: 'komari-theme.json' })
        }

        if (existsSync(previewPath)) {
          archive.file(previewPath, { name: 'preview.png' })
        }

        archive.directory(distDir, 'dist')

        archive.finalize()
      })
    },
  }
}

// 读取 package.json 获取版本号
const packageJson = require('./package.json')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const komariProxyTarget = env.KOMARI_PROXY_TARGET

  return {
    // 定义全局常量，在构建时注入
    define: {
      __BUILD_VERSION__: JSON.stringify(packageJson.version),
      __BUILD_GIT_HASH__: JSON.stringify(getCommitHash()),
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: tag => tag.startsWith('md-'),
          },
        },
      }),
      vueDevTools(),
      UnoCSS(),
      {
        name: 'optional-cjk-font-display',
        enforce: 'pre',
        transform(code, id) {
          if (id.replaceAll('\\', '/').includes('/@fontsource-variable/noto-sans-sc/') && id.endsWith('.css')) {
            return code.replace(/font-display:\s*swap/g, 'font-display:optional')
          }
        },
      },
      komariThemeZip(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      proxy: komariProxyTarget ? createKomariProxy(komariProxyTarget) : undefined,
    },
    build: {
      // 调整 chunk 大小警告阈值
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'vueuse': ['@vueuse/core'],
          },
        },
      },
    },
  }
})
