import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { BadgeTone } from '../Badge/Badge.types'
import type { IconButtonSize } from '../IconButton/IconButton.types'

/** md - форма в одну колонку, lg - подробности в две колонки. */
export type ModalSize = 'md' | 'lg'

/**
 * dim - окно под ним темнеет и размывается; clear - видно как есть: настройка, результат
 * которой смотрят на самой IDE (размер текста).
 */
export type ModalBackdrop = 'dim' | 'clear'

export type ModalProps = {
  open: boolean
  title: string
  /** Строка под заголовком: чей, какой. */
  description?: string | undefined
  icon?: LucideIcon | undefined
  iconTone?: BadgeTone | undefined
  size?: ModalSize | undefined
  backdrop?: ModalBackdrop | undefined
  /**
   * Во всю доступную высоту, а не по содержимому: окно с разделами (настройки) не прыгает,
   * когда раздел короче или длиннее.
   */
  tall?: boolean | undefined
  /**
   * Колонка слева от тела во всю его высоту: меню разделов (вертикальные Tabs). Тело
   * прокручивается рядом, колонка стоит.
   */
  aside?: ReactNode | undefined
  /** В шапке перед крестиком: состояние, переключатель «включено». */
  headerActions?: ReactNode | undefined
  /**
   * Прибито к низу окна, части - по краям: действия над предметом слева, удаление или
   * ответ справа. Одна часть встаёт слева - справа её ставит свой margin-left: auto.
   */
  footer?: ReactNode | undefined
  closeLabel: string
  /** Размер крестика: sm - окно IDE, touch - телефон (под палец). */
  closeSize?: IconButtonSize | undefined
  /** Закрыли: крестик, Esc, щелчок мимо окна. */
  onClose: () => void
  /** Содержимое. Поле, которому фокус при открытии, - с data-autofocus (autoFocus не успеет). */
  children: ReactNode
}
