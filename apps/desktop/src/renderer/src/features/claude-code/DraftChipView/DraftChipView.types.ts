import type { DraftChip } from '@shared/claude-draft'

import type { PictureSource } from '../picture.types'

export type DraftChipViewProps = {
  chip: DraftChip
  /** Картинка за чипом - превью под курсором; нет - обычная подсказка. */
  picture?: PictureSource | null | undefined
  /** Клик по чипу открывает картинку: превью так и говорит. */
  opens?: boolean | undefined
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
