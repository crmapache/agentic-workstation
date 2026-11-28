import type { MarkPoint, WalkthroughLit, WalkthroughStroke } from '@shared/walkthrough'

/**
 * Стрелка как в Shotter: древко и наконечник - многоугольники, хвост - круглый торец. Точки - в
 * точках окна меток.
 */
export type ArrowShape = {
  shaft: MarkPoint[]
  head: MarkPoint[]
  tail: { center: MarkPoint; radius: number }
}

/** Затемнение с вырезами: размер окна и подсветки; leaving - последние, гаснут. */
export type SpotlightProps = {
  width: number
  height: number
  lit: WalkthroughLit[]
  leaving: boolean
}

/** Пометка человека: нарисованная или та, что он ведёт сейчас (live). */
export type StrokeShapeProps = { stroke: Pick<WalkthroughStroke, 'pen' | 'points'>; live?: boolean }
