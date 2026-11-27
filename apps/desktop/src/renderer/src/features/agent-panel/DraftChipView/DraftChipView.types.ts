import type { DraftChip } from '@shared/message-draft'

import type { PictureSource } from '../picture.types'

export type DraftChipViewProps = {
  chip: DraftChip
  /** Картинка за чипом - превью под курсором; нет - обычная подсказка. */
  picture?: PictureSource | null | undefined
  /** Клик по чипу открывает картинку: превью так и говорит. */
  opens?: boolean | undefined
  /** Что делает нажатие на чип - строкой под подсказкой, как «click to open» у картинки. */
  hint?: string | undefined
  /**
   * Плашка целиком внутри своей строки, без отрицательного поля сверху и снизу: для мест,
   * которые режут текст по краю строки (очередь в две строки), иначе срезалась бы рамка.
   */
  contained?: boolean | undefined
  /** Чип в поле: крестик убирает его, у свёрнутой вставки ещё «развернуть». */
  onRemove?: (() => void) | undefined
  onExpand?: (() => void) | undefined
}

export type ChipIconProps = { chip: DraftChip }
