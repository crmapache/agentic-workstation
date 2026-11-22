import type {
  VoiceCue,
  VoiceView,
  VoiceKeyCheck,
  VoiceLanguage,
  VoiceSettings,
  VoiceStartOutcome,
  VoiceSetKeyOutcome,
} from '../voice'
import type { VoiceReadRefusal, VoiceReadingEvent } from '../voice-reading'

type CallRequest = { callId: string }

/** Кадр ответа окну: эпоха и номер (call/voice-endpoint.ts), PCM16 моно 24 кГц. */
export type VoiceAudio = { epoch: number; frame: number; pcm: Uint8Array }

/**
 * Часть контракта (contract.ts) про голосовой режим (ADR 0104): настройки и ключ Deepgram
 * (Settings → Voice), звонок из панели. Окно - конечная точка звонка: пишет микрофон кадрами
 * PCM16 16 кГц и играет ответ; Deepgram и ключ - только в главном процессе.
 */
export type VoiceInvokeContract = {
  'voice:get': { request: void; response: VoiceView }
  /** Настройки целиком; ответ - то, что встало (негодное отброшено). */
  'voice:setSettings': { request: { settings: VoiceSettings }; response: VoiceView }
  /** Новый ключ Deepgram или null - забыть. Окно ключ обратно не получает; не встал - причина. */
  'voice:setKey': { request: { key: string | null }; response: VoiceSetKeyOutcome }
  /** Проверить присланный ключ, а без него - сохранённый. */
  'voice:checkKey': { request: { key: string | null }; response: VoiceKeyCheck }
  /** Образец голоса для «Прослушать»; null - Deepgram не ответил или ключа нет. */
  'voice:preview': {
    request: { language: VoiceLanguage; voice: string }
    response: { pcm: Uint8Array } | null
  }
  /** Звонок из панели: новый разговор в Home; ответ - итог и состояние голоса после него. */
  'voice:start': { request: void; response: { outcome: VoiceStartOutcome; view: VoiceView } }
  'voice:end': { request: CallRequest; response: VoiceView }
  /** Кнопка «Стоп»: агент замолкает и останавливает работу. */
  'voice:stop': { request: CallRequest; response: VoiceView }
  'voice:mute': { request: CallRequest & { on: boolean }; response: VoiceView }
  /** Кадр микрофона, 80 мс PCM16 16 кГц. */
  'voice:mic': { request: CallRequest & { pcm: Uint8Array }; response: void }
  /** Сколько ответа эпохи проиграно (мс) - раз в 200 мс, пока звучит. */
  'voice:played': { request: CallRequest & { epoch: number; ms: number }; response: void }
  /**
   * «Прочитать вслух» ответ модели (ADR 0106): id чтения даёт окно - звук и конец приходят
   * событием `voice:reading` под ним. Ответ - null (началось) или причина отказа.
   */
  'voice:read': {
    request: { readingId: string; text: string }
    response: VoiceReadRefusal | null
  }
  /** Остановить своё чтение: звук больше не идёт, синтез закрыт. */
  'voice:stopReading': { request: { readingId: string }; response: void }
}

export type VoiceEventContract = {
  'voice:changed': VoiceView
  'voice:cue': VoiceCue
  'voice:audio': VoiceAudio
  /** Звук чтения вслух кусками и его конец. */
  'voice:reading': VoiceReadingEvent
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const VOICE_CHANNELS = {
  'voice:get': true,
  'voice:setSettings': true,
  'voice:setKey': true,
  'voice:checkKey': true,
  'voice:preview': true,
  'voice:start': true,
  'voice:end': true,
  'voice:stop': true,
  'voice:mute': true,
  'voice:mic': true,
  'voice:played': true,
  'voice:read': true,
  'voice:stopReading': true,
} satisfies Record<keyof VoiceInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const VOICE_EVENTS = {
  'voice:changed': true,
  'voice:cue': true,
  'voice:audio': true,
  'voice:reading': true,
} satisfies Record<keyof VoiceEventContract, true>
