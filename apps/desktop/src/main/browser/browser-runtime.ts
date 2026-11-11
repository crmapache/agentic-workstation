import { rm } from 'node:fs/promises'

import type { BrowserState, BrowserSetupFailure } from '@shared/connectors'

import { BrowserHub } from './browser-hub'
import type { BrowserPlaces } from './browser-places'
import { installBridge, uninstallBridge } from './native-host-install'
import type { BridgeSource } from './native-host-install'

export type BrowserRuntimeOptions = {
  places: BrowserPlaces
  /** Собранные host.js и расширение рядом с IDE; не собраны - null. */
  source: () => BridgeSource | null
  /** Бинарник IDE: он исполняет host как Node. */
  execPath: string
  ideVersion: string
  /** Куда класть манифесты host: папки браузеров человека или папка теста. */
  manifestDirs: () => string[]
  changed: () => void
}

/**
 * Мост браузера одной IDE (ADR 0040): сокет для расширений (BrowserHub) и установка host и
 * расширения. Ставится, только когда у человека есть коннектор Browser, - не на каждом старте
 * у всех: при старте с включённым коннектором ставится заново (после обновления IDE в папке
 * должна быть новая сборка), удаление коннектора мост убирает.
 */
export class BrowserRuntime {
  readonly hub: BrowserHub
  private installed = false
  private failure: BrowserSetupFailure | null = null
  private extensionBuild: string | null = null
  /** Установка или удаление в пути: следующее ждёт предыдущее, они не пересекаются. */
  private work: Promise<void> = Promise.resolve()

  constructor(private readonly options: BrowserRuntimeOptions) {
    this.hub = new BrowserHub({
      channel: options.places.channel,
      ideVersion: options.ideVersion,
      extensionBuild: () => this.extensionBuild,
    })
    this.hub.onProfiles(() => options.changed())
  }

  /** Поставить мост и открыть сокет. Ошибку не бросает - она в state().failure. */
  enable(): Promise<void> {
    return this.queue(() => this.install())
  }

  /**
   * Убрать мост: сокет закрыт, манифесты host, копия host и файл сокета удалены. Папка
   * расширения остаётся. Повторный вызов и вызов без моста ничего не ломают: так на старте
   * подчищается мост прошлых запусков, если коннектора уже нет.
   */
  remove(): Promise<void> {
    return this.queue(async () => {
      await this.hub.stop()

      const { places } = this.options

      await uninstallBridge(places, this.options.manifestDirs()).catch((error: unknown) =>
        console.warn('[browser] мост не убран', error),
      )

      if (places.socketPath) await rm(places.socketPath, { force: true }).catch(() => undefined)

      const changed = this.installed || this.failure !== null

      this.installed = false
      this.failure = null

      if (changed) this.options.changed()
    })
  }

  stop(): Promise<void> {
    return this.hub.stop()
  }

  state(): BrowserState {
    return {
      installed: this.installed,
      extensionDir: this.installed ? this.options.places.extensionDir : null,
      profiles: this.hub.profiles().map(({ key, name, browser, version }) => ({
        key,
        name,
        browser,
        version,
      })),
      failure: this.failure,
    }
  }

  private queue(task: () => Promise<void>): Promise<void> {
    this.work = this.work.then(task, task)

    return this.work
  }

  private async install(): Promise<void> {
    const { places } = this.options
    const socketPath = places.socketPath

    this.failure = null

    if (!socketPath) {
      console.warn('[browser] путь сокета не укладывается в предел unix-сокета')
      this.failure = 'socket-path'
      this.options.changed()

      return
    }

    try {
      await this.hub.start(socketPath)
    } catch (error) {
      console.warn('[browser] сокет для расширений не открылся', error)
      this.failure = 'socket-failed'
    }

    const source = this.options.source()

    if (!source) {
      console.warn('[browser] рядом с IDE нет собранного host или расширения')
      this.failure ??= 'extension-missing'
    } else {
      try {
        this.extensionBuild = await installBridge(
          source,
          { ...places, socketPath },
          this.options.execPath,
          this.options.manifestDirs(),
        )
        this.installed = true
      } catch (error) {
        console.warn('[browser] мост в Chrome не установился', error)
        this.failure ??= 'install-failed'
      }
    }

    this.options.changed()
  }
}
