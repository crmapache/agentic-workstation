import { spawn } from 'node:child_process'
import { verify } from 'node:crypto'

import { UpdateError } from './update-error'
import type { UpdateAsset } from './update-manifest'
import { WINDOWS_ASSET_KEY, WINDOWS_UPDATE_PUBLIC_KEY } from './update.constants'
import { installWatchScript } from './win-install-watch'
import type { InstallWatchPlan } from './win-install-watch'

/**
 * Что подписывает ключ выпуска: назначение, сборка, версия, sha512 и размер - строками. Версия
 * внутри подписи: иначе подменивший релиз выдал бы старый подписанный установщик за новую
 * версию, и IDE откатилась бы на него. Тот же вид строки собирает
 * scripts/write-update-manifest.mjs - поменять одно без другого нельзя.
 */
export const signedText = (version: string, asset: UpdateAsset): string =>
  ['agentic-workstation-update', WINDOWS_ASSET_KEY, version, asset.sha512, String(asset.size)].join(
    '\n',
  )

/**
 * Подписан ли установщик этой версии ключом выпуска (ADR 0048). Что файл - ровно этот sha512 и
 * размер, проверяет загрузка (downloadAsset), так что подпись держит и файл.
 */
export const isSignedInstaller = (
  asset: UpdateAsset,
  version: string,
  publicKey = WINDOWS_UPDATE_PUBLIC_KEY,
) => {
  if (!asset.signature) return false

  try {
    return verify(
      null,
      Buffer.from(signedText(version, asset)),
      publicKey,
      Buffer.from(asset.signature, 'base64'),
    )
  } catch {
    return false
  }
}

/** Пускает установщик, только если ключ выпуска подписал его вместе с этой версией. */
export const verifyInstaller = (asset: UpdateAsset, version: string): void => {
  if (!isSignedInstaller(asset, version)) {
    throw new UpdateError('signature', 'Установщик обновления не подписан ключом выпуска')
  }
}

/**
 * Поднимает сторожа установки (win-install-watch.ts) отдельным процессом, который переживёт выход
 * IDE. Рабочая папка - временная: унаследуй он папку IDE (ярлык открывает её в папке установки),
 * он держал бы её занятой всё время установки. Сбывается номером процесса, когда сторож запущен;
 * не запустился - ошибка, и IDE не выходит впустую.
 */
export const watchInstaller = (plan: InstallWatchPlan): Promise<number | undefined> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', installWatchScript(plan)],
      { detached: true, stdio: 'ignore', cwd: plan.workDir },
    )

    child.once('error', () =>
      reject(new UpdateError('install', 'Не запустился сторож установки обновления')),
    )
    child.once('spawn', () => {
      child.unref()
      resolve(child.pid)
    })
  })
