import type { MarkPoint, WalkthroughMark } from '@shared/walkthrough'

/**
 * Стрелка как в Shotter: древко и наконечник - многоугольники, хвост - круглый торец. Точки - в
 * точках окна меток.
 */
export type ArrowShape = {
  shaft: MarkPoint[]
  head: MarkPoint[]
  tail: { center: MarkPoint; radius: number }
}

/** Одна метка в окне меток: её размер нужен затемнению - оно покрывает всё окно. */
export type MarkShapeProps = { mark: WalkthroughMark; width: number; height: number }
