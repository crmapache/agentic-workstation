import { existsSync } from 'node:fs'
import { cp, rm, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { EXTENSION_ORIGIN } from '@agentic-workstation/browser-protocol/extension-id'
import { HOST_NAMES } from '@agentic-workstation/browser-protocol/protocol'
import type { HostChannel } from '@agentic-workstation/browser-protocol/protocol'

import type { BrowserPlaces } from './browser-places'
import { CHROMIUM_BROWSERS } from './browser-places'

/** Откуда брать то, что ставится: собранный host.js и папка собранного расширения. */
export type BridgeSource = { hostJs: string; extensionDir: string }

const WRAPPER = 'run-host.sh'
const BUILD_FILE = 'build.json'

/** Строка в одинарных кавычках sh: кавычка внутри - '\''. */
const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`

/**
 * Обёртка, которую запускает Chrome: бинарник IDE исполняет host.js как Node
 * (ELECTRON_RUN_AS_NODE=1). Node у человека может не быть, а PATH у Chrome из launchd пустой -
 * поэтому полный путь к бинарнику IDE, установленной или dev.
 */
export const wrapperScript = (execPath: string, hostJs: string, socketPath: string): string =>
  [
    '#!/bin/sh',
    '# Agentic Workstation browser bridge. Written by the IDE: edits are overwritten.',
    `ELECTRON_RUN_AS_NODE=1 exec ${shellQuote(execPath)} ${shellQuote(hostJs)} --socket ${shellQuote(socketPath)} "$@"`,
    '',
  ].join('\n')

/** Манифест native host: Chrome запускает обёртку только для нашего расширения. */
export const hostManifest = (channel: HostChannel, wrapperPath: string) => ({
  name: HOST_NAMES[channel],
  description: 'Agentic Workstation browser bridge',
  path: wrapperPath,
  type: 'stdio',
  allowed_origins: [EXTENSION_ORIGIN],
})

/**
 * Папки NativeMessagingHosts установленных браузеров: браузер, которого нет (нет его папки в
 * Application Support), не трогается.
 */
export const browserManifestDirs = (applicationSupport: string): string[] =>
  CHROMIUM_BROWSERS.map((browser) => join(applicationSupport, browser)).flatMap((dir) =>
    existsSync(dir) ? [join(dir, 'NativeMessagingHosts')] : [],
  )

/** Сборка расширения в папке (build.json пишет сборка расширения). Нет - null. */
export const extensionBuildIn = async (dir: string): Promise<string | null> => {
  try {
    const parsed = JSON.parse(await readFile(join(dir, BUILD_FILE), 'utf8')) as { build?: unknown }

    return typeof parsed.build === 'string' ? parsed.build : null
  } catch {
    return null
  }
}

/**
 * Поставить мост: копия host.js и обёртка (права 700), копия расширения (только если сборка
 * другая - иначе Chrome зря перечитывал бы папку), манифест host в каждую папку браузера.
 * Ответ - сборка расширения в папке, её IDE называет расширению в welcome.
 */
export const installBridge = async (
  source: BridgeSource,
  places: BrowserPlaces & { socketPath: string },
  execPath: string,
  manifestDirs: readonly string[],
): Promise<string | null> => {
  const hostJs = join(places.hostDir, 'host.js')
  const wrapper = join(places.hostDir, WRAPPER)

  await mkdir(places.hostDir, { recursive: true, mode: 0o700 })
  await cp(source.hostJs, hostJs)
  await writeFile(wrapper, wrapperScript(execPath, hostJs, places.socketPath), { mode: 0o700 })
  await chmod(wrapper, 0o700)

  const shipped = await extensionBuildIn(source.extensionDir)

  if (!shipped || shipped !== (await extensionBuildIn(places.extensionDir))) {
    await rm(places.extensionDir, { recursive: true, force: true })
    await cp(source.extensionDir, places.extensionDir, { recursive: true })
  }

  const manifest = `${JSON.stringify(hostManifest(places.channel, wrapper), null, 2)}\n`

  for (const dir of manifestDirs) {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${HOST_NAMES[places.channel]}.json`), manifest)
  }

  return shipped
}

/**
 * Убрать мост этой IDE: манифесты host и копию host. Папку расширения не трогать - она
 * загружена в Chrome человека, и пропавшая папка выглядела бы поломкой браузера.
 */
export const uninstallBridge = async (
  places: BrowserPlaces,
  manifestDirs: readonly string[],
): Promise<void> => {
  for (const dir of manifestDirs) {
    await rm(join(dir, `${HOST_NAMES[places.channel]}.json`), { force: true })
  }

  await rm(places.hostDir, { recursive: true, force: true })
}
