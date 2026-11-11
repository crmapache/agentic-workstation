import type { ClaudeState } from '@shared/claude'
import type { FeedPatch } from '@shared/claude-feed'
import type { ConversationCall } from '@shared/claude-prefs'
import type { RemoteView } from '@shared/remote'
import type { ScenarioRun } from '@shared/scenario-runs'

import type { JsonFile } from '../storage/json-file'
import { RemoteLine } from './remote-line'
import type { BridgePorts } from './bridge/bridge-ports'
import type { SocketLike } from './link/relay-link'
import type { StoredRemote } from './store/remote-state'
import { isSecureRelay } from './store/remote-state'
import type { Vault } from './store/remote-store'
import { RemoteStore } from './store/remote-store'
import { fingerprint, exportPublic } from './wire/crypto'

export type RemoteDeps = {
  file: JsonFile<StoredRemote>
  vault: Vault
  ports: BridgePorts
  relayUrl: string
  /** Как IDE зовёт себя телефону и какой она версии. */
  machine: () => { label: string; ideVersion: string }
  onView: (view: RemoteView) => void
  /** Сокет до релея; по умолчанию - WebSocket из Node. Тест подставляет свой. */
  createSocket?: (url: string) => SocketLike
}

/** Перемены окну - не чаще этого: подключение, стук и ответ приходят пачкой. */
const VIEW_DEBOUNCE_MS = 50

/**
 * Remote Control IDE (ADR 0041): настройки, пара и вид окна; сама связь - RemoteLine, пока
 * включено. Выключено, пока человек не включит: канал пишет агенту с шеллом на этой машине, и
 * получать его установкой IDE никто не должен.
 */
export class RemoteService {
  private line: RemoteLine | null = null
  private viewTimer: NodeJS.Timeout | null = null
  private offerTimer: NodeJS.Timeout | null = null
  private sentView = ''

  private constructor(
    private readonly store: RemoteStore,
    private readonly deps: RemoteDeps,
  ) {}

  static async load(deps: RemoteDeps): Promise<RemoteService> {
    const service = new RemoteService(await RemoteStore.load(deps.file, deps.vault), deps)

    if (service.store.enabled) service.start()

    return service
  }

  view(): RemoteView {
    const { store } = this
    const agent = this.line?.agent
    const online = agent?.onTheLine() ?? new Set<string>()

    return {
      enabled: store.enabled,
      state: agent?.linkState ?? 'off',
      relayHost: hostOf(this.deps.relayUrl),
      // Ключ появляется, когда связь впервые включили, - не от взгляда на окно.
      fingerprint:
        store.enabled || store.hasIdentity
          ? fingerprint(exportPublic(store.identity().publicKey))
          : '',
      keysKept: store.keysKept,
      devices: store.devices.map((device) => ({
        ...device,
        online: online.has(device.id),
        notifications: store.hasPush(device.id),
      })),
      pairing: agent?.pairing.current() ?? null,
      pending: agent?.pendingPairing() ?? null,
    }
  }

  setEnabled(enabled: boolean): RemoteView {
    this.store.setEnabled(enabled)

    if (enabled) this.start()
    else this.stop()

    return this.view()
  }

  /** Код пары - только при включённой связи; истёк - окно скажет само, без нажатия. */
  startPairing(): RemoteView {
    const offer = this.line?.agent.startPairing()

    if (offer) {
      if (this.offerTimer) clearTimeout(this.offerTimer)

      this.offerTimer = setTimeout(
        () => this.viewSoon(),
        Math.max(0, offer.expiresAt - Date.now()) + 100,
      )
      this.offerTimer.unref()
    }

    return this.view()
  }

  /**
   * Человек нажал Approve у телефона, которого видел в окне. Адрес и отпечаток сверяются с
   * ждущим: за это время мог прийти другой телефон (новый код), и «да» ушло бы не ему.
   */
  approve(expected: { deviceId: string; fingerprint: string }): RemoteView {
    this.line?.agent.approvePairing(expected)

    return this.view()
  }

  /** Отказать ждущему и перестать предлагать код - одно: код и ждущий забыты. */
  refuse(): RemoteView {
    this.line?.agent.refusePairing()

    return this.view()
  }

  /** Отозвать - и при выключенной связи: секрет уходит, кадры перестают открываться. */
  revoke(deviceId: string): RemoteView {
    if (this.line) this.line.agent.revoke(deviceId)
    else this.store.revoke(deviceId)

    return this.view()
  }

  knows(deviceId: string): boolean {
    return this.store.devices.some((device) => device.id === deviceId)
  }

  claudeChanged(state: ClaudeState): void {
    this.line?.claudeChanged(state)
  }

  feedPatched(patch: FeedPatch): void {
    this.line?.feedPatched(patch)
  }

  /** Разговор позвал человека (звук окна): телефону не на связи - пуш. */
  claudeCalled(call: ConversationCall): void {
    this.line?.claudeCalled(call)
  }

  queuesChanged(): void {
    this.line?.queuesChanged()
  }

  runChanged(run: ScenarioRun): void {
    this.line?.runChanged(run)
  }

  workspaceChanged(): void {
    this.line?.workspaceChanged()
  }

  /** Выход из IDE: готовое уходит телефонам, линия гасится, состояние дописывается. */
  async shutdown(): Promise<void> {
    this.stop()

    if (this.viewTimer) clearTimeout(this.viewTimer)
    if (this.offerTimer) clearTimeout(this.offerTimer)

    await this.store.flush()
  }

  private start() {
    if (this.line) return

    if (!isSecureRelay(this.deps.relayUrl)) {
      console.warn('[remote] адрес релея не wss:// и не localhost - связь не поднимается')

      return
    }

    this.line = new RemoteLine({
      store: this.store,
      ports: this.deps.ports,
      createSocket:
        this.deps.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike),
      relayUrl: this.deps.relayUrl,
      machine: this.deps.machine,
      onView: () => this.viewSoon(),
    })
    this.viewSoon()
  }

  private stop() {
    this.line?.stop()
    this.line = null
    this.viewSoon()
  }

  /** Окну - вид, только если он стал другим: сердцебиение линии зовёт это каждые 20 с. */
  private viewSoon() {
    if (this.viewTimer) return

    this.viewTimer = setTimeout(() => {
      this.viewTimer = null

      const view = this.view()
      const print = JSON.stringify(view)

      if (print === this.sentView) return

      this.sentView = print
      this.deps.onView(view)
    }, VIEW_DEBOUNCE_MS)
    this.viewTimer.unref()
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
