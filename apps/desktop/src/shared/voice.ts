import type { PermissionMode } from './conversation'
import { PERMISSION_MODES } from './conversation'
import type { ProviderId } from './providers'
import { isProviderId } from './providers'
import { VOICE_CATALOG } from './voice-catalog'

/**
 * Голосовой режим (ADR 0104): живой разговор с агентом IDE голосом - с телефона или из панели.
 * Речь распознаёт и озвучивает Deepgram (Flux STT и Flux TTS) из главного процесса, думает
 * обычный разговор панели в проекте Home.
 */

/**
 * Языки Flux STT Multilingual (`flux-general-multi`). Flux TTS говорит на большем числе, но
 * числа и даты нормализует только на этих: шире список не делаем.
 */
export const VOICE_LANGUAGES = ['en', 'es', 'fr', 'de', 'hi', 'ru', 'pt', 'ja', 'it', 'nl'] as const

export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]

export const isVoiceLanguage = (value: unknown): value is VoiceLanguage =>
  typeof value === 'string' && (VOICE_LANGUAGES as readonly string[]).includes(value)

/** Реплика, сказанная голосом: на каком языке. Лента ставит у неё значок микрофона. */
export type VoiceMark = { lang: VoiceLanguage }

/**
 * Голосовая реплика в отправку: язык и что человек успел услышать из ответа, который перебил, -
 * модели в скрытую пометку (agents/conversation/voice-note.ts).
 */
export type VoiceOutgoing = VoiceMark & { heard?: string | null | undefined }

/** Мультиязык - язык ответа по последней реплике; язык - всегда он, что бы ни сказал человек. */
export type VoiceLanguageMode = 'multi' | VoiceLanguage

/**
 * Насколько легко голос перебивает агента (spec, «Перебивание»): high - любое слово, medium -
 * два слова или одно уверенное, low - три слова средней уверенности, button - только кнопка
 * «Стоп». Слова «стоп», «хватит» останавливают на любом уровне.
 */
export type VoiceBargeIn = 'high' | 'medium' | 'low' | 'button'

export const VOICE_BARGE_INS: readonly VoiceBargeIn[] = ['high', 'medium', 'low', 'button']

/** Где обрабатывает Deepgram: api.deepgram.com или api.eu.deepgram.com. */
export type VoiceRegion = 'global' | 'eu'

export type VoiceSettings = {
  enabled: boolean
  languageMode: VoiceLanguageMode
  /** Ожидаемые языки мультирежима - подсказка Flux (`language_hint`); пусто - все десять. */
  expected: VoiceLanguage[]
  /** Голос Flux TTS на каждый язык. */
  voices: Record<VoiceLanguage, string>
  speed: number
  bargeIn: VoiceBargeIn
  /**
   * Режим разрешений голосового разговора. Распознавание иногда ошибается, а Home - широкая
   * папка: по умолчанию спрашивать перед записью и командами.
   */
  permissionMode: PermissionMode
  /** Чья панель думает за звонок. */
  provider: ProviderId
  region: VoiceRegion
  /** Тихий сигнал «я ещё тут», пока агент долго работает молча. */
  stillHere: boolean
}

export const VOICE_SPEED_MIN = 0.5
export const VOICE_SPEED_MAX = 1.5
export const VOICE_SPEED_STEP = 0.05

/**
 * Голоса по умолчанию. Четыре выбрал владелец на слух (2026-11-14): прочие русские ему не
 * понравились. Остальным языкам - первый рекомендованный голос каталога.
 */
const CHOSEN_VOICES: Partial<Record<VoiceLanguage, string>> = {
  ru: 'flux-olga-ru',
  es: 'flux-carmen-es',
  en: 'flux-paige-en',
  pt: 'flux-mariana-pt',
}

const firstVoice = (language: VoiceLanguage): string =>
  CHOSEN_VOICES[language] ?? VOICE_CATALOG[language][0]?.model ?? `flux-unknown-${language}`

export const DEFAULT_VOICES = Object.fromEntries(
  VOICE_LANGUAGES.map((language) => [language, firstVoice(language)]),
) as Record<VoiceLanguage, string>

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  languageMode: 'multi',
  expected: ['ru', 'en', 'es', 'pt'],
  voices: DEFAULT_VOICES,
  speed: 1,
  bargeIn: 'medium',
  permissionMode: 'default',
  provider: 'claude',
  region: 'global',
  stillHere: true,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Голос этого языка из каталога; чужой или выдуманный - голос по умолчанию. */
const parseVoice = (language: VoiceLanguage, value: unknown): string =>
  VOICE_CATALOG[language].some((voice) => voice.model === value)
    ? (value as string)
    : DEFAULT_VOICES[language]

/** Скорость Flux TTS: 0.5-1.5 шагом 0.05, иначе Configure отвечает отказом. */
export const clampVoiceSpeed = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_VOICE_SETTINGS.speed

  const clamped = Math.min(VOICE_SPEED_MAX, Math.max(VOICE_SPEED_MIN, value))

  return Math.round(clamped / VOICE_SPEED_STEP) * VOICE_SPEED_STEP
}

/** Настройки с диска или из окна: негодное поле - умолчание, а не ошибка. */
export const parseVoiceSettings = (value: unknown): VoiceSettings => {
  const raw = isRecord(value) ? value : {}
  const voices = isRecord(raw['voices']) ? raw['voices'] : {}
  const expected = Array.isArray(raw['expected'])
    ? [...new Set(raw['expected'].filter(isVoiceLanguage))]
    : DEFAULT_VOICE_SETTINGS.expected
  const mode = raw['languageMode']

  return {
    enabled: raw['enabled'] === true,
    languageMode: mode === 'multi' || isVoiceLanguage(mode) ? mode : 'multi',
    expected,
    voices: Object.fromEntries(
      VOICE_LANGUAGES.map((language) => [language, parseVoice(language, voices[language])]),
    ) as Record<VoiceLanguage, string>,
    speed: clampVoiceSpeed(raw['speed']),
    bargeIn: VOICE_BARGE_INS.find((level) => level === raw['bargeIn']) ?? 'medium',
    permissionMode:
      PERMISSION_MODES.find((mode) => mode === raw['permissionMode']) ??
      DEFAULT_VOICE_SETTINGS.permissionMode,
    provider: isProviderId(raw['provider']) ? raw['provider'] : 'claude',
    region: raw['region'] === 'eu' ? 'eu' : 'global',
    stillHere: raw['stillHere'] !== false,
  }
}

/** Почему кнопка голоса неактивна: режим выключен в настройках или нет ключа Deepgram. */
export type VoiceUnavailable = 'off' | 'noKey'

export type VoiceCapability = { available: true } | { available: false; reason: VoiceUnavailable }

/** Что окну о голосовом режиме: настройки, есть ли ключ (только хвост) и можно ли звонить. */
export type VoiceView = {
  settings: VoiceSettings
  key: { saved: boolean; hint: string | null }
  capability: VoiceCapability
  /** Звонок, который идёт сейчас; null - нет. */
  call: VoiceCallView | null
}

/**
 * Почему звонок не начался: голос недоступен, уже идёт другой звонок, нет провайдера из
 * настроек, macOS не дала микрофон, разговор не открылся.
 */
export type VoiceStartRefusal = VoiceUnavailable | 'busy' | 'noProvider' | 'microphone' | 'failed'

export type VoiceStartOutcome =
  { ok: true; call: VoiceCallView } | { ok: false; reason: VoiceStartRefusal }

/** Ответ проверки ключа: годен, отвергнут Deepgram, Deepgram не ответил. */
export type VoiceKeyCheck = 'ok' | 'invalid' | 'unreachable'

/**
 * Состояние звонка: соединение, слушаю, думаю, выполняю (инструмент), говорю,
 * переподключаюсь, пауза (телефон заблокирован или ушёл в другое приложение).
 */
export type VoiceCallState =
  'connecting' | 'listening' | 'thinking' | 'working' | 'speaking' | 'reconnecting' | 'paused'

/** Откуда звонок: из панели IDE или с телефона. */
export type VoiceOrigin = 'desktop' | 'phone'

/**
 * Чем кончился звонок: положили трубку, потеряли связь дольше тайм-аута, долгая тишина, ключ
 * отвергнут, Deepgram не отвечает, разговор закрыли, IDE закрывается.
 */
export type VoiceCallEnd =
  'hangup' | 'lostLine' | 'silence' | 'keyRejected' | 'deepgram' | 'conversationGone' | 'shutdown'

export type VoiceCallView = {
  id: string
  conversationId: string
  provider: ProviderId
  origin: VoiceOrigin
  state: VoiceCallState
  /** Имя инструмента, пока агент работает (state working); иначе null. */
  tool: string | null
  /** Живой текст реплики человека, пока он говорит; пусто - не говорит. */
  heard: string
  muted: boolean
  /** Язык последней реплики (мультирежим) или выбранный. */
  language: VoiceLanguage | null
  startedAt: number
}

/** Частоты звука: микрофон - как советует Deepgram для Flux, ответ - родная частота голосов. */
export const VOICE_MIC_RATE = 16000
export const VOICE_PLAY_RATE = 24000
/** Кадр микрофона - 80 мс (1280 отсчётов, 2560 байт PCM16): размер, который советует Flux. */
export const VOICE_FRAME_MS = 80

/**
 * Сигнал звонка тому, кто играет звук и пишет микрофон (окно IDE или телефон). Звук ответа идёт
 * отдельно - кадрами PCM16.
 */
export type VoiceCue =
  | { kind: 'state'; call: VoiceCallView }
  | { kind: 'transcript'; role: 'me' | 'agent'; text: string; final: boolean }
  /** Приглушить ответ (level 0.2) или вернуть (1): человек, кажется, заговорил. */
  | { kind: 'duck'; level: number }
  /**
   * Человек перебил: выкинуть всё непроигранное и кадры прежних эпох, которые ещё летят;
   * проигранное считать заново с эпохи epoch.
   */
  | { kind: 'stopPlayback'; epoch: number }
  /** Тихий сигнал «я ещё тут»: агент долго работает молча. */
  | { kind: 'tone' }
  | { kind: 'ended'; reason: VoiceCallEnd; conversationId: string }
