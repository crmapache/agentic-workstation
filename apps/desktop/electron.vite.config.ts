import { resolve } from 'node:path'

import { defineConfig } from 'electron-vite'

import react from '@vitejs/plugin-react'

import { browserBridgePlugin } from './native-host.vite'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    // Браузер для ИИ (ADR 0040): native host и расширение - рядом с main, в out/native-host
    // и out/chrome-extension.
    plugins: [browserBridgePlugin(__dirname)],
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@shared': shared },
      // Одна копия React на всё окно: пакет дизайн-системы лежит отдельно и без
      // этого может притащить свою, а две копии ломают хуки.
      dedupe: ['react', 'react-dom'],
    },
    // Порт закреплён и записан в ~/.claude/ports.md. Без strictPort Vite молча
    // уезжает на соседний порт, и окно грузится не оттуда, откуда ждёшь.
    server: { port: 5315, strictPort: true },
    // Флаг витрины дизайн-системы - строкой при любой сборке. Без явного значения
    // import.meta.env.VITE_SHOWCASE остаётся обращением к объекту, условие не
    // сворачивается при сборке, и код витрины едет в релиз мёртвым грузом.
    define: {
      'import.meta.env.VITE_SHOWCASE': JSON.stringify(process.env.VITE_SHOWCASE ?? ''),
    },
    // electron-vite по умолчанию не сжимает рендерер. Окно грузит бандл с диска, но
    // разбирать JS движку всё равно приходится: меньше код - быстрее первый кадр.
    build: { minify: true },
  },
})
