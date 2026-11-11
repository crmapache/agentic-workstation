import type { SoundEvent } from '@shared/claude-prefs'

import type { ClosableTabCall } from '@agentic-workstation/ui/ClosableTab.types'

/**
 * Повод звука - в цвет света вкладки. Три цвета, а не семь: взгляд на полосу вмещает
 * три. Лимит - внимание, а не ошибка: это пауза.
 */
export const CALL_TONES: Record<SoundEvent, ClosableTabCall> = {
  turnDone: 'success',
  permission: 'attention',
  question: 'attention',
  plan: 'attention',
  limit: 'attention',
  extraUsage: 'attention',
  error: 'danger',
}

/** Дальше этого сдвига нажатие уже не клик, а перетаскивание. */
export const DRAG_THRESHOLD_PX = 4

/**
 * Запас, с которым проверяется смена места и ряда: рука на границе дрожит, и без него
 * соседи дрожали бы вместе с ней.
 */
export const SWAP_GAP_PX = 8

/** Сколько длится приземление брошенной вкладки - как переход сдвига соседей. */
export const LANDING_MS = 160

/** Сколько светящиеся вкладки двигаются без человека рядом (без мыши и клавиш в окне). */
export const CALLS_REST_AFTER_MS = 30_000

/**
 * Под каким ключом жест меряет «+» за последней вкладкой: он не вкладка, но едет вместе с
 * рядом. Id разговоров - uuid, с ними ключ не совпадёт.
 */
export const ADD_KEY = '+'

/** Знак форка перед именем вкладки - как в ACC; глубину показывает и отступ. */
export const FORK_MARK = '⑂'
