import type { BrowserState } from '@shared/connectors'

import type { BrowserRuntime } from '../../../browser/browser-runtime'

/** Что столу нужно от моста: поставить, убрать, состояние, погасить сокет на выходе. */
export type BridgeControl = Pick<BrowserRuntime, 'enable' | 'remove' | 'state' | 'stop'>

/** Что столу нужно от реестра: коннектор Browser, если он есть. */
export type BrowserConnectorLookup = {
  readonly connectors: readonly { kind: string; enabled: boolean }[]
}

/**
 * Коннектор Browser и мост в Chrome (ADR 0040). «Есть ли коннектор» и «включён ли он» -
 * разные вещи: мост ставится, когда коннектор добавлен или включён (и на старте IDE, если
 * он есть и включён, - чтобы после обновления в папке была новая сборка), и убирается, когда
 * коннектора не стало, - включённого или выключенного. Выключенный коннектор моста не
 * трогает: расширение остаётся на связи, а шлюз отказывает его инструментам. На старте без
 * коннектора мост прошлых запусков (сокет, манифесты, копия host) подчищается.
 */
export class BrowserDesk {
  /** Что стол уже сделал с мостом: на старте неизвестно - первая сверка решает сама. */
  private bridge: 'unknown' | 'up' | 'removed' = 'unknown'

  constructor(
    private readonly runtime: BridgeControl,
    private readonly registry: BrowserConnectorLookup,
  ) {}

  /** Свериться с реестром после добавления, удаления, включения и на старте. */
  sync(): void {
    const connector = this.registry.connectors.find((item) => item.kind === 'browser')

    if (!connector) {
      if (this.bridge !== 'removed') void this.runtime.remove()

      this.bridge = 'removed'

      return
    }

    if (connector.enabled && this.bridge !== 'up') {
      void this.runtime.enable()
      this.bridge = 'up'
    }
  }

  state(): BrowserState {
    return this.runtime.state()
  }

  stop(): Promise<void> {
    return this.runtime.stop()
  }
}

/** На плитке Browser вместо аккаунта - профили Chrome на связи; никого нет - null. */
export const browserAccount = (state: BrowserState): string | null =>
  state.profiles.length ? state.profiles.map((profile) => profile.name).join(', ') : null
