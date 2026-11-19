import type { EditorRef } from '@shared/message-draft'

import type { FitStep } from '../composer-fit.utils'

export type EditorChipProps = {
  /** Чей черновик: исключение «не с этим сообщением» помнится по вкладке. */
  conversationKey: string
  /** Открытый в редакторе файл; нет - чипа нет. */
  editor: EditorRef | null
  /**
   * Что ряд кнопок у чипа забрал на узкой панели: имя (значок остаётся, имя - в подсказке)
   * или выключенный чип целиком. Нет - ничего.
   */
  dropped?: ReadonlySet<FitStep> | undefined
}
