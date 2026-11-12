import { build } from 'vite'

import type { PushStrings } from '../src/push/push-text'

/**
 * Сервис-воркер телефонного клиента - отдельной сборкой, классическим скриптом в один файл:
 * воркер-модуль Safari и Firefox поддерживают не везде, а общий с страницей кусок сделал бы
 * его модулем. Исходники - src/sw (оболочка и уведомления на WebCrypto, ключами пары из
 * IndexedDB). Список оболочки известен только после сборки страницы, поэтому собирается в её
 * конце, а имя кэша, файлы и слова уведомлений подставляются вместо __SW_CONFIG__.
 */
export const buildServiceWorker = async (input: {
  root: string
  cacheName: string
  shell: string[]
  strings: PushStrings
}): Promise<string> => {
  const built = await build({
    // Свой конфиг не читается: иначе плагин PWA собирал бы воркер внутри сборки воркера.
    configFile: false,
    root: input.root,
    logLevel: 'warn',
    publicDir: false,
    define: {
      __SW_CONFIG__: JSON.stringify({
        cacheName: input.cacheName,
        shell: input.shell,
        strings: input.strings,
      }),
    },
    build: {
      write: false,
      minify: true,
      copyPublicDir: false,
      lib: {
        entry: 'src/sw/service-worker.ts',
        formats: ['iife'],
        name: 'agenticWorkstationWorker',
        fileName: () => 'sw.js',
      },
    },
  })
  const outputs = Array.isArray(built) ? built : [built]
  const chunk = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .find((item) => item.type === 'chunk' && item.fileName === 'sw.js')

  if (!chunk || chunk.type !== 'chunk') throw new Error('the service worker did not build')

  return `// Сборка apps/phone: src/sw, build/service-worker.ts. Руками не править.\n${chunk.code}`
}
