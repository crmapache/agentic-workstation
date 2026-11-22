import type { VoiceUnavailable } from './voice'

/**
 * «Прочитать вслух» у ответа модели (ADR 0106): текст ответа - в Flux TTS главного процесса
 * голосом и скоростью из Settings → Voice, звук - окну или телефону кусками, пока синтез идёт.
 */

/**
 * Почему не прочитать: голос выключен или нет ключа (как у звонка), идёт звонок (его голос и
 * микрофон заняты), читать нечего - в ответе только код, таблица или ссылки.
 */
export type VoiceReadRefusal = VoiceUnavailable | 'call' | 'empty'

/**
 * Чем кончилось чтение: дочитано, синтез сорвался или главный процесс остановил его сам (начался
 * звонок, IDE закрывается, то же окно или телефон начали другое чтение).
 */
export type VoiceReadingEnd = 'done' | 'failed' | 'stopped'

/** Событие чтения окну: кусок звука (PCM16 моно 24 кГц) или конец. */
export type VoiceReadingEvent = { readingId: string } & (
  { kind: 'audio'; pcm: Uint8Array } | { kind: 'end'; outcome: VoiceReadingEnd }
)

/** id чтения из окна: короткое слово, как id кадров и просьб телефона. */
export const isReadingId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)
