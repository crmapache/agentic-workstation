import { defineConfig } from 'vitest/config'

/**
 * Тесты сборки (токены, манифест) и чистой логики расширения. Своя конфигурация, а не
 * vite.config.ts: у сборки корень - src, и тесты build/ туда не попали бы.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['build/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
