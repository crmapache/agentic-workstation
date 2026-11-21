import type { MouseEvent } from 'react'
import { useContext, createContext } from 'react'

import type { DragSource } from './Board.types'

/** Что доска даёт своим частям: начать перенос, что несут сейчас, сегодня, сдвиг на шаг. */
export type BoardContextValue = {
  press: (event: MouseEvent<HTMLElement>, source: DragSource) => void
  /** id того, что несут сейчас: его место на доске - бледное. */
  draggingId: string | null
  /** Местная полночь сегодня: срок «сегодня» и «просрочен». */
  today: number
  /** Сдвиг на шаг клавиатурой и меню: -1 - выше или левее, 1 - ниже или правее. */
  moveBy: (source: DragSource, delta: -1 | 1) => void
}

export const BoardContext = createContext<BoardContextValue | null>(null)

/** Контекст доски; вне доски - ошибка разработчика. */
export const useBoard = (): BoardContextValue => {
  const value = useContext(BoardContext)

  if (!value) throw new Error('useBoard вне доски трекера')

  return value
}
