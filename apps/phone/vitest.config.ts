import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

/**
 * Тесты телефона: ядро протокола и чистая логика экранов - в Node (WebCrypto и WebSocket там
 * те же, что у браузера), и сверка ядра с настоящей IDE через настоящий релей (e2e/*.test.ts).
 * Прогон в Chromium (*.browser.test.ts) - отдельно: vitest.e2e.config.ts, ему нужна сборка.
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, '../desktop/src/shared') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    exclude: ['e2e/**/*.browser.test.ts'],
  },
})
