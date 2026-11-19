import type { ParseKeys } from 'i18next'

import type { ChangeRefusal } from '@shared/conversation-feed'

/**
 * Длинный список свёрнут: больше COLLAPSE_AFTER - видно первые COLLAPSED_COUNT. Ход,
 * создавший триста файлов, иначе уводил ответ на несколько экранов от поля ввода.
 */
export const COLLAPSE_AFTER = 12
export const COLLAPSED_COUNT = 10

/**
 * Сколько нажатие ждёт ответа главного процесса, прежде чем кнопка снова оживёт:
 * окно закрыли, ответ потерялся. Живьём ответ приходит за доли секунды.
 */
export const PRESS_PATIENCE_MS = 15_000

/**
 * Сколько нажатие ждёт молча. Ответ приходит быстрее, а мелькнувшее по всем строкам
 * «Reverting…», сразу сменённое «Reverted», - рывок ни о чём.
 */
export const QUIET_PRESS_MS = 500

/** Почему откат или возврат не прошёл - словами на строке файла. */
export const REFUSAL_KEYS: Record<ChangeRefusal, ParseKeys> = {
  changed: 'agentPanel.changes.refusedChanged',
  missing: 'agentPanel.changes.refusedMissing',
  failed: 'agentPanel.changes.refusedFailed',
}
