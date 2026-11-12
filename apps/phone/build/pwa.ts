import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import type { Plugin } from 'vite'

import type { PushStrings } from '../src/push/push-text'
import { drawIcon, hexColor, encodePng } from './icons'
import { buildServiceWorker } from './service-worker'

/** Значки: размер и maskable (Android режет края сам) - имена закреплены манифестом. */
const ICONS = [
  { file: 'icons/icon-192.png', size: 192, maskable: false },
  { file: 'icons/icon-512.png', size: 512, maskable: false },
  { file: 'icons/icon-maskable-512.png', size: 512, maskable: true },
  { file: 'icons/apple-touch-icon.png', size: 180, maskable: true },
] as const

/** Цвет палитры из tokens.css - сырой hex: манифест и значок не понимают var(--...). */
export const paletteColor = (tokensCss: string, name: string): string => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(tokensCss)

  if (!match?.[1]) throw new Error(`tokens.css has no --${name} as #rrggbb`)

  return match[1]
}

type PwaOptions = { root: string; tokensPath: string; localePath: string }

type Locale = { app: { name: string; shortName: string }; push: PushStrings }

/**
 * PWA телефонного клиента при сборке: манифест (имя, тёмная тема из токенов), значки, сервис-
 * воркер (оболочка со списком файлов этой сборки и уведомления) и ссылки на них в странице. В dev ничего этого
 * нет: воркер в разработке только мешал бы, держа старую сборку.
 */
export const pwa = ({ root, tokensPath, localePath }: PwaOptions): Plugin => {
  const tokens = readFileSync(tokensPath, 'utf8')
  const locale = JSON.parse(readFileSync(localePath, 'utf8')) as Locale
  const background = paletteColor(tokens, 'palette-graphite-1000')
  const tile = paletteColor(tokens, 'palette-graphite-850')
  const accent = paletteColor(tokens, 'palette-orange-400')

  return {
    name: 'agentic-workstation-phone-pwa',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'manifest', href: '/manifest.webmanifest' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'theme-color', content: background }, injectTo: 'head' },
      {
        tag: 'link',
        attrs: { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
        injectTo: 'head',
      },
    ],
    async generateBundle(_options, bundle) {
      for (const icon of ICONS) {
        this.emitFile({
          type: 'asset',
          fileName: icon.file,
          source: encodePng(
            icon.size,
            drawIcon(icon.size, hexColor(tile), hexColor(accent), icon.maskable),
          ),
        })
      }

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(
          {
            name: locale.app.name,
            short_name: locale.app.shortName,
            start_url: '/',
            scope: '/',
            display: 'standalone',
            orientation: 'portrait',
            background_color: background,
            theme_color: background,
            icons: ICONS.filter((icon) => icon.size !== 180).map((icon) => ({
              src: `/${icon.file}`,
              sizes: `${icon.size}x${icon.size}`,
              type: 'image/png',
              purpose: icon.maskable ? 'maskable' : 'any',
            })),
          },
          null,
          2,
        ),
      })

      const shell = new Set([
        '/index.html',
        '/manifest.webmanifest',
        ...ICONS.map((icon) => `/${icon.file}`),
        ...Object.keys(bundle)
          .filter((file) => file !== 'index.html')
          .map((file) => `/${file}`),
      ])
      const files = [...shell]
      const cacheName = `aw-phone-${createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)}`

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: await buildServiceWorker({
          root,
          cacheName,
          shell: files,
          strings: locale.push,
        }),
      })
    },
  }
}
