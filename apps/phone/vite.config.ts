import { join } from 'node:path'

import { defineConfig } from 'vite'

import react from '@vitejs/plugin-react'

import { pwa } from './build/pwa'

/** Порт dev-сервера телефона (записан в ~/.claude/ports.md); релей локально - 4460. */
const DEV_PORT = 3025

const RELAY_DEV = 'http://localhost:4460'

/**
 * Телефонный клиент Remote Control. В бою его раздаёт релей с того же хоста, куда телефон потом
 * звонит сокетом (apps/relay/Dockerfile кладёт dist в папку раздачи). В dev страница идёт с
 * Vite, а сокет и /privacy - через прокси к локальному релею: адрес релея телефон выводит из
 * адреса страницы, и в dev он тот же хост.
 */
export default defineConfig({
  plugins: [
    react(),
    pwa({
      root: import.meta.dirname,
      tokensPath: join(import.meta.dirname, '../../packages/ui/src/styles/tokens.css'),
      localePath: join(import.meta.dirname, 'src/locales/en.json'),
    }),
  ],
  server: {
    port: DEV_PORT,
    strictPort: true,
    proxy: {
      '/v1': { target: RELAY_DEV, ws: true },
      '/privacy': RELAY_DEV,
    },
  },
  preview: { port: DEV_PORT, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
