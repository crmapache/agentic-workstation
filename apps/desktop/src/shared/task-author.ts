import type { TaskDraft } from './tasks'

/**
 * Задание, которое ИИ написал из слов человека: вид, имя, текст прогона, ритм, переключатели и
 * пределы поручения. Модель, усилие и разрешения ИИ не выбирает - их ставит человек в форме:
 * сколько свободы дать прогону, решает он.
 */
export type TaskAuthored = Pick<
  TaskDraft,
  'kind' | 'name' | 'prompt' | 'schedule' | 'catchUp' | 'report' | 'goal'
>

/**
 * Почему ИИ не написал задание: нет Claude Code, не успел, ответил не по форме, отказ CLI
 * (detail - его слова, по-английски).
 */
export type TaskAuthorError = 'noClaude' | 'timeout' | 'unreadable' | 'failed'

/** Итог: написанное задание (ещё не сохранено - его откроет форма) или отказ; отменённое - молча. */
export type TaskAuthorOutcome =
  | { ok: true; task: TaskAuthored }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: TaskAuthorError; detail: string }
