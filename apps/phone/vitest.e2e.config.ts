import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

/**
 * Сквозная проверка в настоящем мобильном Chromium: собранный клиент (dist) раздаёт настоящий
 * релей, по ту сторону - настоящий RemoteService с подделками сервисов IDE. Запуск -
 * `pnpm --filter @agentic-workstation/phone e2e` (сначала соберёт клиент). Снимки экранов -
 * в .screenshots/phone-*.png в корне репозитория.
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, '../desktop/src/shared') },
  },
  test: {
    environment: 'node',
    include: ['e2e/**/*.browser.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
