import { spawn } from 'node:child_process'
import { verify } from 'node:crypto'

import { psQuote } from '../windows/powershell'
import { UpdateError } from './update-error'
import type { UpdateAsset } from './update-manifest'
import {
  INSTALLER_WAIT_MS,
  WINDOWS_ASSET_KEY,
  WINDOWS_INSTALLER_ARGS,
  WINDOWS_UPDATE_PUBLIC_KEY,
} from './update.constants'

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
 * Сторож установки: ждёт, пока IDE выйдет целиком (сохранит файлы, погасит Claude и сценарии),
 * и только тогда запускает установщик тихо - он ставит новую версию поверх и открывает её.
 * Запусти установщик сразу, он убил бы IDE посреди выхода. IDE так и не вышла за отведённое
 * время (выход отменили - несохранённое в редакторе) - сторож убирает установщик и уходит, как
 * подмена на маке.
 */
export const installerWatch = (installerPath: string, pid: number, waitMs: number): string =>
  [
    `$ide = Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    `if ($ide -and -not $ide.WaitForExit(${waitMs})) {`,
    `  Remove-Item -LiteralPath ${psQuote(installerPath)} -Force -ErrorAction SilentlyContinue`,
    '  exit 1',
    '}',
    `Start-Process -FilePath ${psQuote(installerPath)} -ArgumentList ${WINDOWS_INSTALLER_ARGS.map(psQuote).join(',')}`,
  ].join('\n')

/**
 * Поднимает сторожа отдельным процессом, который переживёт выход IDE. Сбывается, когда он
 * запущен; не запустился - ошибка, и IDE не выходит впустую.
 */
export const watchInstaller = (installerPath: string, pid: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        installerWatch(installerPath, pid, INSTALLER_WAIT_MS),
      ],
      { detached: true, stdio: 'ignore' },
    )

    child.once('error', () =>
      reject(new UpdateError('install', 'Не запустился сторож установки обновления')),
    )
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
