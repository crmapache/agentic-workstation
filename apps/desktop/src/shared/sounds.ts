/**
 * Звуки IDE: чем разговор провайдера зовёт человека (ход закончен, вопрос, лимит, поломка) и
 * как громко. Настройка - IDE, а не панели провайдера (Settings → Sounds, ADR 0046): зовут
 * разговоры любого провайдера и любого проекта, а слышит их один человек за одним столом.
 */

/** Поводы звука: ход закончен, вопросы к человеку, лимит, доплата, поломка. */
export type SoundEvent =
  'turnDone' | 'permission' | 'question' | 'plan' | 'limit' | 'extraUsage' | 'error'

export const SOUND_EVENTS: readonly SoundEvent[] = [
  'turnDone',
  'permission',
  'question',
  'plan',
  'limit',
  'extraUsage',
  'error',
]

/**
 * Поводы от самого тревожного к будничному (как в ACC). Из нескольких поводов одной
 * вкладки зовёт первый по списку; из звуков подряд слышен следующий, только если он
 * важнее предыдущего.
 */
export const SOUND_PRIORITY: readonly SoundEvent[] = [
  'error',
  'limit',
  'extraUsage',
  'permission',
  'question',
  'plan',
  'turnDone',
]

/** Громкость звука по умолчанию, проценты. */
export const DEFAULT_SOUND_VOLUME = 70

/**
 * Настройка звуков. Выключенный повод не зовёт вовсе - ни звуком, ни светом вкладки, ни
 * точкой на вкладке проекта: видно только то, что прозвучало бы.
 */
export type SoundPrefs = {
  muted: SoundEvent[]
  /** Громкость по поводу, проценты; нет записи - DEFAULT_SOUND_VOLUME. */
  volumes: Partial<Record<SoundEvent, number>>
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = { muted: [], volumes: {} }
