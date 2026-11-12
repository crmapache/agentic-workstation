import { join } from 'node:path'

import { defineConfig } from 'vite'

import { designTokens } from './build/design-tokens'
import { extensionPackage } from './build/extension-package'
import { BUILD_TARGET } from './build/manifest'
import { SRC, DIST, TOKENS_PATH, PACKAGE_ROOT } from './build/paths'

/**
 * Расширение Chrome (ADR 0040). Основная сборка - модули: сервис-воркер (background.js -
 * имя закреплено манифестом), окно значка и offscreen-документ. Курсор на странице, значки и
 * манифест - после неё (build/extension-package.ts).
 */
export default defineConfig({
  root: SRC,
  publicDir: join(PACKAGE_ROOT, 'public'),
  plugins: [designTokens(TOKENS_PATH), extensionPackage()],
  build: {
    outDir: DIST,
    emptyOutDir: true,
    target: BUILD_TARGET,
    // Распакованное расширение человек может открыть в DevTools - читаемый код дороже пары
    // килобайт, которые никуда не качаются.
    minify: false,
    // Сервис-воркер без document: заготовка modulepreload в нём упала бы.
    modulePreload: false,
    rollupOptions: {
      input: {
        background: join(SRC, 'background/background.ts'),
        popup: join(SRC, 'popup/popup.html'),
        offscreen: join(SRC, 'offscreen/offscreen.html'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
