import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { build } from 'vite'
import type { Plugin } from 'vite'

import { parseTokens, designTokens, tokenClosure } from './design-tokens'
import { drawIcon, hexColor, encodePng, ICON_SIZES } from './icons'
import { BUILD_TARGET, extensionManifest } from './manifest'
import { SRC, DIST, TOKENS_PATH, PACKAGE_ROOT } from './paths'

/** Файл рядом с манифестом: IDE читает из него сборку, не разбирая version_name. */
export const BUILD_FILE = 'build.json'

/** Курсор и рамка внедряются в чужую страницу обычным скриптом - без import и чанков. */
const buildOverlay = async (): Promise<void> => {
  await build({
    configFile: false,
    root: SRC,
    logLevel: 'warn',
    plugins: [designTokens(TOKENS_PATH)],
    build: {
      outDir: DIST,
      emptyOutDir: false,
      target: BUILD_TARGET,
      minify: false,
      lib: {
        entry: join(SRC, 'overlay/overlay.ts'),
        formats: ['iife'],
        name: 'agenticWorkstationOverlay',
        fileName: () => 'overlay.js',
      },
    },
  })
}

/** Цвет токена, раскрытый до шестнадцатеричного значения палитры. */
const tokenHex = (tokens: ReadonlyMap<string, string>, name: string): string => {
  let value = tokenClosure([name], tokens).get(name) ?? ''

  while (value.startsWith('var(')) value = tokens.get(value.slice(4, -1).trim()) ?? ''

  return value
}

const writeIcons = async (): Promise<void> => {
  const tokens = parseTokens(await readFile(TOKENS_PATH, 'utf8'))
  const background = hexColor(tokenHex(tokens, '--color-surface-sunken'))
  const accent = hexColor(tokenHex(tokens, '--color-accent'))
  const rim = hexColor(tokenHex(tokens, '--color-fg-strong'))

  await mkdir(join(DIST, 'icons'), { recursive: true })

  for (const size of ICON_SIZES) {
    await writeFile(
      join(DIST, 'icons', `icon-${size}.png`),
      encodePng(size, drawIcon(size, background, accent, rim)),
    )
  }
}

const filesIn = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
}

/** Сборка - хеш всего, что в папке, кроме манифеста: одинаковый код - одинаковая сборка. */
const buildId = async (): Promise<string> => {
  const hash = createHash('sha256')

  for (const file of await filesIn(DIST)) {
    const name = relative(DIST, file)

    if (name === 'manifest.json' || name === BUILD_FILE) continue

    hash.update(name).update(await readFile(file))
  }

  return hash.digest('hex').slice(0, 12)
}

/**
 * После основной сборки (сервис-воркер, окно значка, offscreen): курсор отдельным скриптом,
 * значки, манифест со сборкой и build.json для IDE.
 */
export const extensionPackage = (): Plugin => ({
  name: 'agentic-workstation-extension-package',
  apply: 'build',
  closeBundle: async () => {
    await buildOverlay()
    await writeIcons()

    const { version } = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      version: string
    }
    const build = await buildId()

    await writeFile(
      join(DIST, 'manifest.json'),
      `${JSON.stringify(extensionManifest({ version, build }), null, 2)}\n`,
    )
    await writeFile(join(DIST, BUILD_FILE), `${JSON.stringify({ version, build })}\n`)
  },
})
