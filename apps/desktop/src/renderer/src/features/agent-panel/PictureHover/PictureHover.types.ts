import type { ReactNode } from 'react'

import type { PictureSource } from '../picture.types'

export type PictureHoverProps = {
  /** Картинка за чипом. */
  source: PictureSource
  /** Клик по чипу открывает картинку - под ней так и написано. */
  opens: boolean
  /** Сам чип. */
  children: ReactNode
}

/** Что сейчас в превью: картинка с размером, ожидание или «нечего показать». */
export type HoverShown =
  | { state: 'ready'; url: string; width: number; height: number }
  | { state: 'loading' }
  | { state: 'missing' }
  | null
