import type { EffortLevel } from './conversation'
import { ALL_EFFORT_LEVELS } from './conversation'
import { MODEL_NAME_PATTERN } from './panel-prefs'
import type { ProviderId } from './providers'
import { isUnattendedProviderId } from './providers'

/**
 * Настройки всей IDE без своей службы (Settings): то, что действует одинаково для всех
 * провайдеров и проектов. Владелец - главный процесс (`ide-prefs.json`), окну - событием.
 */

/** С какого числа строк вставка сворачивается в чип; 0 - никогда. */
export const DEFAULT_PASTE_COLLAPSE = 2

/** Потолок числа строк на диске: окно даёт набрать до 500, запас - на будущее окно. */
export const PASTE_COLLAPSE_LIMIT = 1000

/**
 * Порог сворачивания в окне (как в ACC): от двух - одна строка значила бы «сворачивать всё»; до
 * пятисот - больше уже не читают перед отправкой. «Никогда» - отдельный выбор, а не ноль на шкале.
 */
export const PASTE_COLLAPSE_MIN = 2
export const PASTE_COLLAPSE_MAX = 500

/**
 * Больше стольких символов вставка сворачивается всегда, что бы ни стояло в настройке: замер
 * ACC - на мегабайте в поле каждая буква идёт восьмую долю секунды.
 */
export const PASTE_ALWAYS_FOLDS_CHARS = 100_000

/**
 * Провайдер служебной работы с моделью и усилием. Пустая модель - своя у работы (у Claude Code
 * для сообщения коммита - Haiku), пустое усилие - как решит провайдер.
 */
export type AiChoice = { provider: ProviderId; model: string; effort: EffortLevel | '' }

/** Основной и до трёх запасных: дальше человек всё равно не станет ждать. */
export const COMMIT_AI_MAX = 4

export type IdePrefs = {
  /** С какого числа строк вставка в поле разговора любого провайдера сворачивается в чип. */
  pasteCollapse: number
  /**
   * Кто пишет сообщение коммита у кнопки Commit and push - по порядку: не ответил первый
   * (лимит, нет CLI, ошибка) - спрашивается следующий. Всегда хотя бы один.
   */
  commitAi: AiChoice[]
}

export type IdePrefsPatch = Partial<IdePrefs>

export const DEFAULT_IDE_PREFS: IdePrefs = {
  pasteCollapse: DEFAULT_PASTE_COLLAPSE,
  commitAi: [{ provider: 'claude', model: '', effort: '' }],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const lines = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, PASTE_COLLAPSE_LIMIT)
    : undefined

/** Выбор провайдера из записи; негодный (Antigravity, чужое имя) - null, модель - только похожая на имя. */
const aiChoice = (value: unknown): AiChoice | null => {
  if (!isRecord(value) || !isUnattendedProviderId(value['provider'])) return null

  const model = typeof value['model'] === 'string' ? value['model'].trim() : ''
  const effort = ALL_EFFORT_LEVELS.find((level) => level === value['effort']) ?? ''

  return {
    provider: value['provider'],
    model: model && MODEL_NAME_PATTERN.test(model) ? model : '',
    effort,
  }
}

const commitAi = (value: unknown): AiChoice[] | undefined => {
  if (!Array.isArray(value)) return undefined

  const chain = value
    .map(aiChoice)
    .filter((choice) => choice !== null)
    .slice(0, COMMIT_AI_MAX)

  return chain.length > 0 ? chain : undefined
}

/** Настройки с диска или из окна поверх base: негодное поле остаётся прежним, а не ломает все. */
export const parseIdePrefs = (value: unknown, base: IdePrefs = DEFAULT_IDE_PREFS): IdePrefs => {
  const input = isRecord(value) ? value : {}

  return {
    pasteCollapse: lines(input['pasteCollapse']) ?? base.pasteCollapse,
    commitAi: commitAi(input['commitAi']) ?? base.commitAi,
  }
}

/**
 * До общих настроек сворачивание вставки жило в настройках панели Claude Code (claude.json,
 * prefs.pasteCollapse): переезжает оттуда. Нет его там - null.
 */
export const legacyIdePrefs = (claudeFile: unknown): IdePrefsPatch | null => {
  const prefs = isRecord(claudeFile) && isRecord(claudeFile['prefs']) ? claudeFile['prefs'] : {}
  const pasteCollapse = lines(prefs['pasteCollapse'])

  return pasteCollapse === undefined ? null : { pasteCollapse }
}
