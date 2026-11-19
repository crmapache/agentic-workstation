import type { RewindPreview, RewindRefusal } from '@shared/rewind'
import { REWIND_FILES_LISTED } from '@shared/rewind'

import { numberField, stringField } from '../cli/cli-messages'
import { CliExitedError } from '../cli/cli-process'

/**
 * Ответы CLI на `rewind_conversation` и `rewind_files` словами панели (замеры ACC на
 * 2.1.280). Отказ CLI приходит успехом с `rewound: false` и `reason`; ошибка канала -
 * исключением управляющего запроса.
 */

/** Причина отказа CLI: несколько его причин для человека - одно и то же. */
export const refusalOf = (reason: string): RewindRefusal => {
  switch (reason) {
    case 'turn_running':
    case 'prompt_pending':
    case 'commands_queued':
    case 'state_changed':
      return 'busy'
    case 'target_not_found':
      return 'gone'
    case 'stale_target':
    case 'unseen_later_turn':
      return 'moved'
    case 'target_splits_tool_call':
    case 'poll_tool_result_target':
    case 'delivered_poll_events_in_range':
      return 'midCall'
    case 'persist_failed':
      return 'notSaved'
    default:
      return 'other'
  }
}

/**
 * Ошибка канала вместо ответа: процесс ушёл, не ответив, или CLI не знает такого
 * запроса (говорит это словами).
 */
export const refusalOfError = (error: unknown): { refusal: RewindRefusal; detail: string } => {
  if (error instanceof CliExitedError) return { refusal: 'ended', detail: '' }

  const detail = error instanceof Error ? error.message : String(error)

  return /unknown|unsupported/i.test(detail)
    ? { refusal: 'unsupported', detail }
    : { refusal: 'other', detail }
}

/**
 * Непрочитанное сообщение в идущем ходе CLI под собой не режет даже с
 * interrupt_if_running: ход останавливается, и запрос повторяется.
 */
export const waitsOnUnread = (reason: string): boolean =>
  reason === 'commands_queued' || reason === 'prompt_pending'

/** Слова отказа обрезки: свои слова CLI, а без них - его код. */
export const cutDetail = (reply: Record<string, unknown>): string =>
  stringField(reply, 'error') || stringField(reply, 'reason')

/** Ответ на `rewind_files` с `dry_run`: что вернёт откат кода. */
export const codeOf = (reply: Record<string, unknown>): RewindPreview => {
  if (reply['canRewind'] !== true) {
    const error = stringField(reply, 'error')

    if (error.startsWith('File rewinding is not enabled')) return { state: 'notTracked' }
    if (error.startsWith('No file checkpoint found')) return { state: 'noCheckpoint' }

    return { state: 'unavailable', detail: error }
  }

  const changed = reply['filesChanged']
  const files = Array.isArray(changed)
    ? changed.filter((path): path is string => typeof path === 'string' && path.trim() !== '')
    : []

  if (files.length === 0) return { state: 'none' }

  return {
    state: 'ready',
    files,
    count: files.length,
    insertions: numberField(reply, 'insertions'),
    deletions: numberField(reply, 'deletions'),
  }
}

/** Ошибка канала на `rewind_files`: CLI, не знающий запроса, копий и не держит. */
export const codeOfError = (refusal: RewindRefusal, detail: string): RewindPreview =>
  refusal === 'unsupported' ? { state: 'notTracked' } : { state: 'unavailable', detail }

/**
 * Почему код не вернуть - подробность отказа code: имя состояния предпросмотра (окно
 * скажет его теми же словами, что диалог) или слова CLI.
 */
export const codeDetail = (preview: RewindPreview): string =>
  preview.state === 'unavailable' ? preview.detail : preview.state === 'ready' ? '' : preview.state

/** Ответ на `rewind_files` без `dry_run`: null - файлы вернулись, иначе слова CLI. */
export const restoredOf = (reply: Record<string, unknown>): string | null =>
  reply['canRewind'] === true ? null : stringField(reply, 'error') || 'not restored'

/**
 * Что от file осталось за папкой folder и разделителем; null - файл не внутри.
 * Разделители сравниваются одним видом: CLI на Windows пишет пути через «\».
 */
const inside = (file: string, folder: string): string | null => {
  const base = folder.replace(/\\/g, '/').replace(/\/+$/, '')
  const plain = file.replace(/\\/g, '/')

  if (!base || plain.length <= base.length + 1 || plain[base.length] !== '/') return null
  if (!plain.startsWith(base)) return null

  return file.slice(base.length + 1)
}

/**
 * Предпросмотр с путями от корня проекта, а вне его - от «~»: память агента живёт под
 * `~/.claude` и правится теми же инструментами, что код. Список - не длиннее
 * REWIND_FILES_LISTED, count - сколько всего.
 */
export const relativePreview = (
  preview: RewindPreview,
  root: string,
  home: string,
): RewindPreview => {
  if (preview.state !== 'ready') return preview

  const files = preview.files.slice(0, REWIND_FILES_LISTED).map((file) => {
    const fromRoot = inside(file, root)

    if (fromRoot !== null) return fromRoot

    const fromHome = inside(file, home)

    return fromHome === null ? file : `~/${fromHome}`
  })

  return { ...preview, files }
}
