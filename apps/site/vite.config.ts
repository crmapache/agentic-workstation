import { join } from 'node:path'

import { defineConfig } from 'vite'

/**
 * Порт сайта (записан в ~/.claude/ports.md). Тот же порт слушает nginx в контейнере на сервере,
 * как у остальной статики на нём (notepad, apps-site).
 */
const PORT = 3026

/**
 * /release.json - последний выпуск с GitHub. В бою его отдаёт nginx из своего кеша
 * (nginx.conf), здесь - прокси прямо в API: для dev и preview лимита в 60 запросов в час хватает.
 */
const releaseProxy = {
  '/release.json': {
    target: 'https://api.github.com',
    changeOrigin: true,
    rewrite: () => '/repos/crmapache/agentic-workstation-releases/releases/latest',
  },
}

/**
 * Сайт - статические страницы: index.html с разметкой и стилями, немного скрипта для кнопок
 * скачивания и копирования команды, политика конфиденциальности (privacy/index.html) и 404.html
 * для чужих адресов (её отдаёт nginx). Картинки лежат в src/assets и получают хеш в имени,
 * поэтому nginx отдаёт их с вечным кешем, а страницы - без кеша.
 */
export default defineConfig({
  server: { port: PORT, strictPort: true, proxy: releaseProxy },
  preview: { port: PORT, strictPort: true, proxy: releaseProxy },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Картинки страницы - снимки окна по сотне килобайт: в разметку их не встраивать.
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        main: join(import.meta.dirname, 'index.html'),
        privacy: join(import.meta.dirname, 'privacy/index.html'),
        notFound: join(import.meta.dirname, '404.html'),
      },
    },
  },
})
