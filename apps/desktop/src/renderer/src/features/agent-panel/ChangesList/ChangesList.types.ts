import type { ParseKeys } from 'i18next'

import type { FileChange, TurnFeedItem } from '@shared/conversation-feed'

export type ChangesListProps = {
  turn: TurnFeedItem
}

/**
 * Нажатие, на которое главный процесс ещё не ответил. token - чьё оно: ответ снимает
 * только своё. announced - ждёт дольше тихой паузы, строка говорит «Reverting…».
 */
export type Press = { restore: boolean; token: number; at: number; announced: boolean }

/** Нажатия по пути файла. */
export type Presses = ReadonlyMap<string, Press>

/** Что сказать на строке рядом с именем: ключ текста и плохо ли это (отказ). */
export type RowNote = { key: ParseKeys; bad: boolean }

export type ChangeRowProps = {
  change: FileChange
  /** У списка есть кнопки: строка без своей держит место, цифры стоят столбцом. */
  slot: boolean
  /** Строку можно откатить или вернуть: у неё своя кнопка. */
  actionable: boolean
  press: Press | undefined
  onToggle: (change: FileChange) => void
}
