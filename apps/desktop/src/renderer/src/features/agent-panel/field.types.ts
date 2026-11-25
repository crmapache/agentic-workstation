import type { RefObject } from 'react'

import type { DraftChip, DraftToken } from '@shared/message-draft'
import type { CommandEntry } from '@shared/slash-catalog'

import type { ChipRegistry } from './field-chips'

/** Что полю ввода нужно снаружи: куски из черновика и куда сообщать правки. */
export type FieldOptions = {
  tokens: DraftToken[]
  onChange: (tokens: DraftToken[]) => void
  /** Сколько картинок уже ушло в разговоре: номера новых продолжают счёт. */
  imageBase: number
  /** Знакомые команды: набранное имя с пробелом становится чипом, только если команда есть. */
  commands: readonly CommandEntry[]
  /** Класс узла чипа - стили чипов живут у поля. */
  chipClassName: string
}

/** Поле ввода с чипами: узел, чипы и правки, которые делает код, а не набор. */
export type Field = {
  fieldRef: RefObject<HTMLDivElement | null>
  registry: ChipRegistry
  /** Где каретка стояла в поле последний раз: вставка без фокуса в поле встаёт туда. */
  lastCaret: RefObject<Range | null>
  /** Клавиатура полю (кнопка, подсказка, открытое поле): каретка где оставили, иначе в конце. */
  takeKeyboard: () => void
  /** Заменить содержимое целиком - шагом истории отмен. */
  applyTokens: (next: DraftToken[]) => void
  /** Прочитать поле (с перенумерацией картинок) и сообщить правку. */
  commit: (boundary?: boolean) => void
  /** Перечитать поле без шага отмены: чип узнал свой путь на диске. */
  refresh: () => void
  /** Набранная команда с пробелом - в чип; true - поле пересобрано. */
  captureTyped: (next: DraftToken[]) => boolean
  readTokens: () => DraftToken[]
  undo: () => void
  redo: () => void
  clearChipSelection: () => void
  /** Клавиша для подсвеченного чипа или стрелка, упёршаяся в чип; true - обработана. */
  handleChipKey: (event: KeyboardEvent) => boolean
  handleInput: (event: Event) => void
  handleCompositionEnd: () => void
  /** Нажатие мыши: гасит подсвеченный чип, нажатие выше первой строки ставит на неё. */
  handleMouseDown: (event: MouseEvent) => void
  /** Фокус пришёл без каретки (окно вернуло фокус, focus() кодом) - вернуть её на место. */
  handleFocus: () => void
}

/**
 * Куда встаёт чип: в место каретки (буфер, цитата, скрепка) или в конец набранного (файл и
 * картинка, брошенные в поле: точка броска мышью - случайное место посреди фразы).
 */
export type ChipSpot = 'caret' | 'end'

/** Вставка в место каретки: чип, текст или куски из буфера. */
export type FieldInsert = {
  insertChip: (chip: DraftChip, spot?: ChipSpot) => void
  insertText: (text: string) => void
  insertTokens: (tokens: readonly DraftToken[]) => void
  /** Подстановка из подсказки «@»: «@запрос» заменяется чипом файла или папки. */
  insertFileReference: (path: string) => void
}
