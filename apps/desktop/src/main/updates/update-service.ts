import { rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'

import { gt } from 'semver'

import type { UpdateStatus, ManualUpdateReason } from '@shared/updates'

import { IS_WINDOWS } from '../platform'
import { findAppBundle, getManualUpdateReason, readDesignatedRequirement } from './app-bundle'
import { downloadAsset, fetchUpdateManifest } from './update-download'
import { UpdateError } from './update-error'
import { scheduleSwap, unpackUpdate, verifyUpdate, removeBundleDir } from './update-installer'
import type { UpdateAsset, UpdateManifest } from './update-manifest'
import {
  STAGING_DIR_NAME,
  UPDATE_ASSET_KEY,
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
} from './update.constants'
import { watchInstaller, verifyInstaller } from './win-update'

export type UpdateServiceOptions = {
  feedUrl: string
  currentVersion: string
  isPackaged: boolean
  executablePath: string
  downloadsDir: string
  logPath: string
  /**
   * Переменная окружения NAME=value для новой версии после перезапуска (профиль,
   * в котором шло обновление). Пусто - перезапуск как обычно.
   */
  relaunchEnv: string
  onStatus: (status: UpdateStatus) => void
  /** Выйти из приложения, чтобы подмена могла начаться. */
  quit: () => void
}

/** Найденная новая версия и то, как её можно поставить. */
type Offer = {
  manifest: UpdateManifest
  asset: UpdateAsset
  manualReason: ManualUpdateReason | null
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Обновление приложения. Раз в несколько часов смотрит манифест последнего
 * релиза; нашлась версия новее - сообщает окну. По команде из окна качает zip,
 * проверяет подпись, подменяет себя и перезапускается. Почему так, а не через
 * electron-updater, - docs/adr/0004-self-update.md. На Windows - установщик целиком с подписью
 * ключа выпуска, он ставит себя сам (ADR 0048).
 */
export class UpdateService {
  private status: UpdateStatus = { kind: 'idle' }
  private offer: Offer | null = null
  private dismissedVersion: string | null = null
  private lastProgressPercent = -1

  constructor(private readonly options: UpdateServiceOptions) {}

  start(): void {
    setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS)
    setInterval(() => void this.check(), CHECK_INTERVAL_MS)
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  /**
   * Тихая проверка: нет сети или релизов - не повод тревожить человека, только
   * строка в журнале.
   */
  async check(): Promise<void> {
    if (this.status.kind === 'downloading' || this.status.kind === 'installing') return

    try {
      const manifest = await fetchUpdateManifest(this.options.feedUrl)
      const asset = manifest.assets[UPDATE_ASSET_KEY]
      const isNewer = gt(manifest.version, this.options.currentVersion)

      if (!isNewer || asset === undefined || manifest.version === this.dismissedVersion) return

      const manualReason = await getManualUpdateReason(
        this.options.isPackaged,
        this.options.executablePath,
      )

      this.offer = { manifest, asset, manualReason }
      this.setStatus({
        kind: 'available',
        version: manifest.version,
        notes: manifest.notes,
        install: manualReason ? { mode: 'manual', reason: manualReason } : { mode: 'automatic' },
      })
    } catch (error) {
      console.warn('[updates] проверка не удалась:', describeError(error))
    }
  }

  /** Поставить найденную версию. Повторный вызов во время загрузки ничего не делает. */
  async install(): Promise<void> {
    const offer = this.offer
    const isOfferShown = this.status.kind === 'available' || this.status.kind === 'failed'

    if (offer === null || !isOfferShown || offer.manualReason !== null) return
    if (IS_WINDOWS) return this.installOnWindows(offer)

    const { version } = offer.manifest
    const installedBundle = findAppBundle(this.options.executablePath)

    if (installedBundle === null) return

    const stagingDir = join(dirname(installedBundle), STAGING_DIR_NAME)
    const zipPath = join(this.options.downloadsDir, `agentic-workstation-${version}.zip`)

    try {
      this.lastProgressPercent = -1
      this.setStatus({ kind: 'downloading', version, progress: 0 })

      const requirement = await readDesignatedRequirement(installedBundle)

      if (requirement === null) {
        throw new UpdateError('signature', 'Не удалось прочитать подпись установленного приложения')
      }

      await downloadAsset(offer.asset, zipPath, (fraction) =>
        this.reportProgress(version, fraction),
      )

      const stagedBundle = await unpackUpdate(zipPath, stagingDir)

      await verifyUpdate(stagedBundle, requirement, version)
      await rm(zipPath, { force: true })

      this.setStatus({ kind: 'installing', version })
      scheduleSwap({
        installedBundle,
        stagedBundle,
        stagingDir,
        logPath: this.options.logPath,
        relaunchEnv: this.options.relaunchEnv,
      })
      this.options.quit()
    } catch (error) {
      // Уборка - по возможности: её сбой не должен заслонить настоящую причину.
      await Promise.allSettled([removeBundleDir(stagingDir), rm(zipPath, { force: true })])
      console.warn(`[updates] ${version} не встала:`, describeError(error))
      this.setStatus({
        kind: 'failed',
        version,
        reason: error instanceof UpdateError ? error.reason : 'install',
      })
    }
  }

  /**
   * Windows (ADR 0048): подпись ключа выпуска - до загрузки (без неё качать незачем), установщик
   * целиком, сторож, который запустит его после выхода IDE, и выход. Остальное - установщик:
   * поставит новую версию поверх и запустит её.
   */
  private async installOnWindows({ manifest, asset }: Offer): Promise<void> {
    const { version } = manifest
    const installer = join(this.options.downloadsDir, `agentic-workstation-${version}-setup.exe`)

    try {
      this.lastProgressPercent = -1
      this.setStatus({ kind: 'downloading', version, progress: 0 })
      verifyInstaller(asset, version)
      await downloadAsset(asset, installer, (fraction) => this.reportProgress(version, fraction))
      await watchInstaller(installer, process.pid)
      this.setStatus({ kind: 'installing', version })
      this.options.quit()
    } catch (error) {
      await rm(installer, { force: true }).catch(() => undefined)
      console.warn(`[updates] ${version} не встала:`, describeError(error))
      this.setStatus({
        kind: 'failed',
        version,
        reason: error instanceof UpdateError ? error.reason : 'install',
      })
    }
  }

  /** Отложить: до следующего запуска про эту версию не напоминаем. */
  dismiss(): UpdateStatus {
    if (this.status.kind === 'available' || this.status.kind === 'failed') {
      this.dismissedVersion = this.status.version
      this.setStatus({ kind: 'idle' })
    }

    return this.status
  }

  /** Прогресс уходит в окно по целым процентам, а не на каждый кусок загрузки. */
  private reportProgress(version: string, fraction: number) {
    const percent = Math.floor(fraction * 100)

    if (percent === this.lastProgressPercent) return

    this.lastProgressPercent = percent
    this.setStatus({ kind: 'downloading', version, progress: fraction })
  }

  private setStatus(status: UpdateStatus) {
    this.status = status
    this.options.onStatus(status)
  }
}
