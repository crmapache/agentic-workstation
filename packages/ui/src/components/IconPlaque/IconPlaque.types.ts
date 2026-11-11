import type { LucideIcon } from 'lucide-react'

import type { BadgeTone } from '../Badge/Badge.types'

/** md - плитка, строка списка и шапка вида (ростом с полосу вкладок), lg - шапка окна. */
export type IconPlaqueSize = 'md' | 'lg'

export type IconPlaqueProps = {
  icon: LucideIcon
  /** Тон плашки: тип узнаётся цветом. Нет - нейтральная. */
  tone?: BadgeTone | undefined
  size?: IconPlaqueSize | undefined
  /** Выключенное: тон гаснет до тихого серого, форма та же. */
  muted?: boolean | undefined
}
