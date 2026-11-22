import { randomUUID } from 'node:crypto'

import type { AgentPanelState } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import type { ProviderId } from '@shared/providers'
import type {
  VoiceView,
  VoiceRegion,
  VoiceCallEnd,
  VoiceCallView,
  VoiceKeyCheck,
  VoiceCapability,
  VoiceStartOutcome,
} from '@shared/voice'

import type { ConversationsPort } from '../remote/bridge/bridge-ports'
import type { VoiceStore } from './voice-store'
import type { Timer } from './call/utterances'
import { VoiceCall } from './call/voice-call'
import type { VoiceEndpoint } from './call/voice-endpoint'
import type { DeepgramDial } from './deepgram/deepgram-link'

export type VoiceServiceDeps = {
  store: VoiceStore
  /** Панели провайдеров - тем же портом, что у телефона. */
  panels: () => readonly ConversationsPort[]
  /** Папка проекта Home (ADR 0059); нет - звонить некуда. */
  homePath: () => string | null
  dial: DeepgramDial
  timer: Timer
  now: () => number
  checkKey: (key: string, region: VoiceRegion) => Promise<VoiceKeyCheck>
  onView: (view: VoiceView) => void
  /** Звонок кончился: телефону - пуш, когда агент доделает (ADR 0104). */
  onEnded?: ((call: VoiceCallView, reason: VoiceCallEnd) => void) | undefined
}

/** Таймер на setTimeout: отмена - функцией. */
export const realTimer: Timer = (run, ms) => {
  const handle = setTimeout(run, ms)

  return () => clearTimeout(handle)
}

/**
 * Голосовой режим IDE (ADR 0104): настройки, ключ и звонок. Звонок один на IDE: из панели или
 * с телефона. Он открывает новый разговор в Home у провайдера из настроек и живёт, пока его не
 * положат; лента и состояние панелей доходят до него отсюда.
 */
export class VoiceService {
  private active: { call: VoiceCall; provider: ProviderId } | null = null

  constructor(private readonly deps: VoiceServiceDeps) {}

  /** Можно ли звонить сейчас: телефону - в список машины. */
  get capability(): VoiceCapability {
    return this.deps.store.capability
  }

  view(): VoiceView {
    return this.deps.store.view(this.active?.call.view ?? null)
  }

  async setSettings(value: unknown): Promise<VoiceView> {
    await this.deps.store.set(value)

    return this.changed()
  }

  async setKey(key: string | null): Promise<VoiceView> {
    await this.deps.store.setKey(key)

    return this.changed()
  }

  /** Проверить ключ: присланный (ещё не сохранённый) или сохранённый. */
  checkKey(key?: string | null): Promise<VoiceKeyCheck> {
    const candidate = key?.trim() || this.deps.store.key

    if (!candidate) return Promise.resolve('invalid')

    return this.deps.checkKey(candidate, this.deps.store.settings.region)
  }

  /** Начать звонок с этой конечной точкой: новый разговор в Home, Deepgram, «слушаю». */
  async start(endpoint: VoiceEndpoint): Promise<VoiceStartOutcome> {
    const { store, panels, homePath } = this.deps
    const capability = store.capability
    const key = store.key

    if (!capability.available) return { ok: false, reason: capability.reason }
    if (!key) return { ok: false, reason: 'noKey' }
    if (this.active) return { ok: false, reason: 'busy' }

    const { settings } = store
    const port = panels().find((candidate) => candidate.provider === settings.provider)
    const home = homePath()

    if (!port?.info()) return { ok: false, reason: 'noProvider' }
    if (!home) return { ok: false, reason: 'failed' }

    const conversationId = await port
      .newConversation(home, { permissionMode: settings.permissionMode })
      .catch((error: unknown) => {
        console.warn('Voice: the call conversation did not open', error)

        return null
      })

    if (!conversationId) return { ok: false, reason: 'failed' }

    const call = new VoiceCall({
      id: randomUUID(),
      conversationId,
      view: { provider: port.provider, origin: endpoint.origin, startedAt: this.deps.now() },
      settings,
      key,
      dial: this.deps.dial,
      timer: this.deps.timer,
      endpoint,
      agent: {
        send: (text, voice) => port.send(conversationId, { text, images: [], voice }),
        interrupt: () => port.interrupt(conversationId),
        notice: (code, detail) => port.voiceNotice(conversationId, code, detail),
      },
      checkKey: () => this.checkKey(),
      onView: () => this.changed(),
      onEnded: (reason) => this.ended(call, reason),
    })

    this.active = { call, provider: port.provider }

    const feed = await port.getFeed(conversationId).catch(() => null)

    call.start(feed?.items ?? [])
    call.conversation(conversationOf(port.getState(), conversationId))
    this.changed()

    return { ok: true, call: call.view }
  }

  /** Звонок по id - для команд конечной точки; чужой или кончившийся - null. */
  call(id: string): VoiceCall | null {
    return this.active?.call.view.id === id ? this.active.call : null
  }

  end(id: string, reason: VoiceCallEnd = 'hangup'): void {
    this.call(id)?.end(reason)
  }

  feed(patch: FeedPatch): void {
    this.active?.call.feed(patch)
  }

  state(provider: ProviderId, state: AgentPanelState): void {
    const active = this.active

    if (!active || active.provider !== provider) return

    active.call.conversation(conversationOf(state, active.call.conversationId))
  }

  shutdown(): void {
    this.active?.call.end('shutdown')
  }

  private ended(call: VoiceCall, reason: VoiceCallEnd): void {
    if (this.active?.call !== call) return

    this.active = null
    this.deps.onEnded?.(call.view, reason)
    this.changed()
  }

  private changed(): VoiceView {
    const view = this.view()

    this.deps.onView(view)

    return view
  }
}

const conversationOf = (state: AgentPanelState, id: string) =>
  state.conversations.find((conversation) => conversation.id === id) ?? null
