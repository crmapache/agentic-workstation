/**
 * Computer (ADR 0057, 0058): ИИ работает на компьютере человека настоящими мышью и клавиатурой по снимкам
 * экрана. Общие типы окна IDE, капсулы и главного процесса.
 */

/** Разрешения macOS, без которых Computer не работает. */
export type ComputerPermission = 'accessibility' | 'screen'

/**
 * Готов ли компьютер к работе ИИ: работает ли Computer на этой системе (мак и Windows), нужны ли
 * ей разрешения (только маку) и выданы ли они - «Универсальный доступ» (мышь и клавиатура) и
 * «Запись экрана» (снимки). Windows разрешений не спрашивает - оба поля там true.
 */
export type ComputerState = {
  supported: boolean
  needsPermissions: boolean
  accessibility: boolean
  screen: boolean
}

/** Действие руки ИИ - инструмент сервера Computer. */
export type ComputerActionKind =
  'screenshot' | 'zoom' | 'click' | 'move' | 'drag' | 'scroll' | 'type' | 'key' | 'open_app'

/**
 * Что ИИ делает или говорит сейчас - строка капсулы. intent - его слова о шаге, который идёт
 * (необязательное поле каждого инструмента); action - тот же шаг без его слов: окно называет
 * действие само, detail - клавиши, приложение, направление; said - последняя законченная фраза
 * его ответа в разговоре между шагами.
 */
export type CapsuleActivity =
  | { kind: 'intent'; text: string }
  | { kind: 'action'; action: ComputerActionKind; detail: string }
  | { kind: 'said'; text: string }

/**
 * Капсула внизу экрана, пока ИИ держит компьютер: что он делает - действует, думает между
 * действиями, стоит на паузе человека - и строкой, что именно (activity; null - сказать нечего,
 * только состояние словом). null вместо капсулы - компьютер свободен.
 */
export type CapsuleView = {
  state: 'working' | 'ready' | 'paused'
  activity: CapsuleActivity | null
}

/** Кнопки капсулы. */
export type CapsuleAction = 'pause' | 'resume' | 'stop'

/** Имя сервера Computer: тип в начале - правило коннекторов (ADR 0028). */
export const COMPUTER_SERVER_NAME = 'computer'
