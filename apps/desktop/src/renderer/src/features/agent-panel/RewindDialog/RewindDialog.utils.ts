import type { TFunction } from 'i18next'

import type { RewindScope, RewindPreview } from '@shared/rewind'

import { REFUSAL_KEYS, CODE_STATE_KEYS } from './RewindDialog.constants'
import type { ShownRefusal } from './RewindDialog.types'

/**
 * Забирает ли «In a new tab» код с собой: файлы одни на обе вкладки, и при «Both» код
 * возвращается здесь же, перед форком.
 */
export const forkTakesCode = (choice: RewindScope, code: RewindPreview | undefined): boolean =>
  choice === 'both' && code?.state === 'ready'

/**
 * Форк с кодом ждёт конца хода: идущий ход пишет файлы, и вернуть их под ним CLI
 * отказывает всегда - говорится до нажатия. Форк одного разговора не ждёт никогда.
 */
export const forkBlocked = (
  choice: RewindScope,
  code: RewindPreview | undefined,
  running: boolean,
): boolean => running && forkTakesCode(choice, code)

/** Почему кода не предложить - теми же словами, что отказ code. */
export const codeWords = (
  t: TFunction,
  code: Exclude<RewindPreview, { state: 'ready' }>,
): string => {
  if (code.state !== 'unavailable') return t(CODE_STATE_KEYS[code.state])

  return code.detail
    ? t('agentPanel.rewind.unavailable', { detail: code.detail })
    : t('agentPanel.rewind.refused.noProcess')
}

const isCodeState = (detail: string): detail is keyof typeof CODE_STATE_KEYS =>
  detail in CODE_STATE_KEYS

/** Почему разговор откатился, а файлы нет: код причины - словами панели, иначе слова системы. */
export const filesFailedWords = (t: TFunction, detail: string): string =>
  t('agentPanel.rewind.filesFailed', {
    detail: isCodeState(detail) ? t(CODE_STATE_KEYS[detail]) : detail,
  })

/** Почему откат не прошёл - словами панели. */
export const refusalWords = (t: TFunction, { reason, detail }: ShownRefusal): string => {
  if (reason === 'code') {
    return isCodeState(detail)
      ? t(CODE_STATE_KEYS[detail])
      : codeWords(t, { state: 'unavailable', detail })
  }

  if (reason === 'other' && detail) return t('agentPanel.rewind.refused.other', { detail })
  if (reason === null || reason === 'other') return t('agentPanel.rewind.refused.failed')

  return t(REFUSAL_KEYS[reason])
}

/** Первая непустая строка сообщения - чтобы не промахнуться, к какому откатываемся. */
export const subjectLine = (text: string): string =>
  text.split('\n').find((line) => line.trim() !== '') ?? ''

/** Имя файла первым, папка после, бледнее: обрезанный с конца путь прятал бы имя. */
export const pathParts = (path: string): { name: string; folder: string } => {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))

  return cut < 0
    ? { name: path, folder: '' }
    : { name: path.slice(cut + 1), folder: path.slice(0, cut) }
}
