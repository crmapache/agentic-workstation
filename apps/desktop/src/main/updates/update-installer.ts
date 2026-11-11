import { spawn, execFile } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import originalFs from 'node:original-fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { UpdateError } from './update-error'
import { SWAP_SCRIPT, SWAP_WAIT_TICKS, BACKUP_BUNDLE_NAME } from './update.constants'

const run = promisify(execFile)

/**
 * Удаляет папку с бандлом приложения. Через original-fs, а не node:fs: Electron
 * подменяет fs так, что app.asar внутри бандла выглядит папкой, и обычный
 * рекурсивный rm спотыкается на нём с ENOTEMPTY.
 */
export const removeBundleDir = (path: string) =>
  originalFs.promises.rm(path, { recursive: true, force: true })

/**
 * Распаковывает zip в папку рядом с установленным приложением. ditto, а не unzip:
 * он сохраняет симлинки фреймворков и атрибуты, без которых подпись бандла ломается.
 */
export const unpackUpdate = async (zipPath: string, stagingDir: string): Promise<string> => {
  await removeBundleDir(stagingDir)
  await mkdir(stagingDir, { recursive: true })
  await run('ditto', ['-x', '-k', zipPath, stagingDir]).catch((error: unknown) => {
    throw new UpdateError('install', `Не распаковался архив обновления: ${String(error)}`)
  })

  const bundleName = (await readdir(stagingDir)).find((name) => name.endsWith('.app'))

  if (bundleName === undefined)
    throw new UpdateError('integrity', 'В архиве обновления нет приложения')

  return join(stagingDir, bundleName)
}

/**
 * Пускает новую версию, только если она подписана так же, как установленная
 * (подходит под её правило подписи), и если это ровно та версия, что в манифесте.
 * Это и есть защита от подменённого релиза: без нашего ключа подписи такую сборку
 * не сделать.
 */
export const verifyUpdate = async (
  stagedBundle: string,
  requirement: string,
  expectedVersion: string,
): Promise<void> => {
  try {
    await run('codesign', ['--verify', '--deep', '--strict', '-R', `=${requirement}`, stagedBundle])
  } catch {
    throw new UpdateError('signature', 'Подпись новой версии не совпадает с установленной')
  }

  const { stdout } = await run('plutil', [
    '-extract',
    'CFBundleShortVersionString',
    'raw',
    '-o',
    '-',
    join(stagedBundle, 'Contents', 'Info.plist'),
  ])

  if (stdout.trim() !== expectedVersion) {
    throw new UpdateError(
      'integrity',
      `В архиве версия ${stdout.trim()}, а ждали ${expectedVersion}`,
    )
  }
}

type SwapPlan = {
  installedBundle: string
  stagedBundle: string
  stagingDir: string
  logPath: string
  relaunchEnv: string
}

/**
 * Запускает подмену отдельным процессом, который переживёт выход приложения.
 * Сразу после вызова приложение должно завершиться: подмена ждёт именно этого.
 */
export const scheduleSwap = ({
  installedBundle,
  stagedBundle,
  stagingDir,
  logPath,
  relaunchEnv,
}: SwapPlan) => {
  const child = spawn(
    '/bin/sh',
    [
      '-c',
      SWAP_SCRIPT,
      'agentic-workstation-update',
      String(process.pid),
      installedBundle,
      stagedBundle,
      join(stagingDir, BACKUP_BUNDLE_NAME),
      logPath,
      String(SWAP_WAIT_TICKS),
      relaunchEnv,
    ],
    { detached: true, stdio: 'ignore' },
  )

  child.unref()
}
