import { existsSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'

import { build } from 'vite'
import type { Plugin } from 'vite'

/**
 * Собрать native host (ADR 0040) одним файлом host.js без зависимостей: его копируют в
 * ~/.agentic-workstation/native-host, и рядом с ним не будет ни node_modules, ни чанков
 * главного процесса. Поэтому - своя сборка, а не ещё один вход main: Rollup вынес бы общий
 * код в чанк, и одиночная копия файла не запустилась бы.
 */
export const buildNativeHost = async (root: string, outDir: string): Promise<string> => {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    build: {
      ssr: resolve(root, 'src/native-host/host.ts'),
      outDir,
      emptyOutDir: true,
      target: 'node22',
      minify: false,
      rollupOptions: { output: { format: 'cjs', entryFileNames: 'host.js' } },
    },
    // Всё внутрь, кроме модулей Node: рядом с копией host.js node_modules нет.
    ssr: { noExternal: true, target: 'node' },
  })

  return join(outDir, 'host.js')
}

/**
 * Мост браузера рядом с главным процессом: `<out>/native-host/host.js` и собранное расширение
 * `<out>/chrome-extension` (из apps/browser-extension/dist - его собирает скрипт build). Папка
 * out - та же, куда пишет сборка main (`--outDir` копии окна агента тоже), так что dev,
 * копия окна и приложение находят их одинаково: рядом с main. В приложение они едут
 * ресурсами (electron-builder.yml, extraResources).
 */
export const browserBridgePlugin = (root: string): Plugin => {
  let outRoot = resolve(root, 'out')

  return {
    name: 'agentic-workstation-browser-bridge',
    apply: 'build',
    configResolved: (config) => {
      outRoot = dirname(resolve(config.root, config.build.outDir))
    },
    closeBundle: async () => {
      await buildNativeHost(root, join(outRoot, 'native-host'))

      const extension = resolve(root, '../browser-extension/dist')
      const target = join(outRoot, 'chrome-extension')

      await rm(target, { recursive: true, force: true })

      if (existsSync(join(extension, 'manifest.json'))) {
        await cp(extension, target, { recursive: true })
      } else {
        console.warn(
          '[browser] расширение не собрано: pnpm --filter @agentic-workstation/browser-extension build',
        )
      }
    },
  }
}
