import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { BadgeTone } from '../Badge/Badge.types'

/** solid - то, что уже есть (подключённый коннектор); dashed - приглашение добавить. */
export type TileVariant = 'solid' | 'dashed'

export type TileProps = {
  icon: LucideIcon
  /** Тон плашки иконки: тип узнаётся цветом. Нет - нейтральная. */
  iconTone?: BadgeTone | undefined
  title: string
  /** Строка под заголовком: чей, куда. Режется многоточием. */
  description?: string | undefined
  /** Описание - объяснение, а не значение: переносится целиком, а не режется. */
  wrapDescription?: boolean | undefined
  /** Третья строка тише: где виден, сколько всего. Режется многоточием. */
  meta?: string | undefined
  /** Состояние (Badge) в правом верхнем углу, вровень с верхом плашки иконки. */
  status?: ReactNode | undefined
  variant?: TileVariant | undefined
  /** Выключенное: плитка тише, но нажимается - открыть и включить. */
  muted?: boolean | undefined
  /** Открыта сейчас (её подробности рядом): залита, как выбранное. */
  selected?: boolean | undefined
  onClick: () => void
}
