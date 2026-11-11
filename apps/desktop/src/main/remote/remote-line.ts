import { randomBytes } from 'node:crypto'

import type { ClaudeState } from '@shared/claude'
import type { FeedPatch } from '@shared/claude-feed'
import type { ScenarioRun } from '@shared/scenario-runs'

import { encodeBody } from '@agentic-workstation/remote-protocol/body'

import { RemoteAgent } from './agent/remote-agent'
import { Bridge } from './bridge/bridge'
import type { BridgePorts } from './bridge/bridge-ports'
import type { SocketLike } from './link/relay-link'
import type { RemoteStore } from './store/remote-store'

/** Сердцебиение линии и слив очереди. */
export const BEAT_MS = 20_000

export type LineDeps = {
  store: RemoteStore
  ports: BridgePorts
  createSocket: (url: string) => SocketLike
  relayUrl: string
  machine: () => { label: string; ideVersion: string }
  onView: () => void
}

/**
 * Remote Control, пока он включён: агент на релее и мост к сервисам IDE. Живёт от включения
 * до выключения и уносит с собой всё, что держал: подписки, журналы лент, очереди кадров.
 */
export class RemoteLine {
  readonly agent: RemoteAgent
  readonly bridge: Bridge
  private readonly beat: NodeJS.Timeout
  private flushTimer: NodeJS.Immediate | null = null

  constructor(deps: LineDeps) {
    this.agent = new RemoteAgent(
      {
        store: deps.store,
        createSocket: deps.createSocket,
        relayUrl: deps.relayUrl,
        label: () => deps.machine().label,
        onView: deps.onView,
      },
      {
        handle: (deviceId, message) => this.bridge.handle(deviceId, message),
        startedAgain: (deviceId) => this.bridge.startedAgain(deviceId),
        forgotten: (deviceId) => this.bridge.forget(deviceId),
      },
    )
    this.bridge = new Bridge({
      ports: deps.ports,
      send: (deviceId, message) => {
        this.agent.queue(deviceId, encodeBody(message))
        this.flushSoon()
      },
      onTheLine: () => this.agent.onTheLine(),
      allow: (deviceId, kind) => this.agent.limits.allow(deviceId, kind),
      machine: deps.machine,
      // Жизнь линии: телефон с номером ленты из прошлой жизни получит снимок, а не дыру.
      epoch: randomBytes(6).toString('base64url'),
    })
    this.beat = setInterval(() => {
      this.agent.beat()
      // «На связи» гаснет само, когда телефон замолчал, - окну нужно это увидеть.
      deps.onView()
    }, BEAT_MS)
    this.beat.unref()
    this.agent.start()
  }

  stop(): void {
    clearInterval(this.beat)

    if (this.flushTimer) clearImmediate(this.flushTimer)

    this.bridge.stop()
    this.agent.stop()
  }

  claudeChanged(state: ClaudeState): void {
    this.bridge.claudeChanged(state)
  }

  feedPatched(patch: FeedPatch): void {
    this.bridge.feedPatched(patch)
  }

  queuesChanged(): void {
    this.bridge.queuesChanged()
  }

  runChanged(run: ScenarioRun): void {
    this.bridge.runChanged(run)
  }

  workspaceChanged(): void {
    this.bridge.workspaceChanged()
  }

  /** Слить очередь, как только текущая работа кончится: пачка за один такт - одним сливом. */
  private flushSoon() {
    this.flushTimer ??= setImmediate(() => {
      this.flushTimer = null
      this.agent.flush()
    })
  }
}
