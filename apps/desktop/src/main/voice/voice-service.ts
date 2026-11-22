import { randomUUID } from 'node:crypto'

import type { AgentPanelState } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import type { ProviderId } from '@shared/providers'
import type {
  VoiceView,
  VoiceOrigin,
  VoiceRegion,
  VoiceCallEnd,
  VoiceCallView,
  VoiceKeyCheck,
  VoiceLanguage,
  VoiceCapability,
  VoiceStartOutcome,
  VoiceSetKeyOutcome,
} from '@shared/voice'

import type { ConversationsPort } from '../remote/bridge/bridge-ports'
import { previewVoice } from './voice-preview'
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
  /**
   * Звонок поднимается (разговор ещё открывается): бронь ставится до первого ожидания, иначе два
   * старта в одну секунду (двойное нажатие, панель и телефон) открыли бы два звонка.
   */
  private starting = false
  /** Образец голоса, который сейчас синтезируется: второй ждёт первого, а не открывает сокет. */
  private previewing: Promise<Uint8Array | null> | null = null

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
    this.active?.call.applySettings(this.deps.store.settings)

    return this.changed()
  }

  /**
   * Новый ключ или null - забыть. Негодный по виду ключ не пишется: в подпротокол WebSocket он
   * не встанет. Ключ сменили посреди звонка - звонок кладётся: прежний ключ не должен работать.
   */
  async setKey(key: string | null): Promise<VoiceSetKeyOutcome> {
    const outcome = await this.deps.store.setKey(key)

    if (!outcome.ok) return outcome

    this.active?.call.end('hangup')

    return { ok: true, view: this.changed() }
  }

  /** Образец голоса для «Прослушать»; ключа нет или Deepgram не ответил - null. */
  preview(language: VoiceLanguage, voice: string): Promise<Uint8Array | null> {
    const { key, settings } = this.deps.store

    if (!key) return Promise.resolve(null)

    this.previewing ??= previewVoice({
      key,
      region: settings.region,
      language,
      voice,
      speed: settings.speed,
      dial: this.deps.dial,
      timer: this.deps.timer,
    }).finally(() => {
      this.previewing = null
    })

    return this.previewing
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
    if (this.active || this.starting) return { ok: false, reason: 'busy' }

    const { settings } = store
    const port = panels().find((candidate) => candidate.provider === settings.provider)
    const home = homePath()

    if (!port?.info()) return { ok: false, reason: 'noProvider' }
    if (!home) return { ok: false, reason: 'failed' }

    this.starting = true

    try {
      return await this.open(endpoint, port, home, key)
    } finally {
      this.starting = false
    }
  }

  private async open(
    endpoint: VoiceEndpoint,
    port: ConversationsPort,
    home: string,
    key: string,
  ): Promise<VoiceStartOutcome> {
    const { settings } = this.deps.store
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

    const feed = await port.getFeed(conversationId).catch(() => null)

    this.active = { call, provider: port.provider }

    try {
      call.start(feed?.items ?? [])
      call.conversation(conversationOf(port.getState(), conversationId))
    } catch (error) {
      // Звонок не поднялся (Deepgram не принял соединение) - он не должен висеть «занято».
      console.warn('Voice: the call did not start', error)
      call.end('deepgram')

      return { ok: false, reason: 'failed' }
    }

    this.changed()

    return { ok: true, call: call.view }
  }

  /** Конечная точка этого вида пропала (окно IDE закрыли или оно упало): её звонок кончается. */
  endFrom(origin: VoiceOrigin): void {
    if (this.active?.call.view.origin === origin) this.active.call.end('lostLine')
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
