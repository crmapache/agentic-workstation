import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { BadgeTone } from '../Badge/Badge.types'

export type PageHeaderProps = {
  /** Иконка вида - та же, что у него в полосе видов. */
  icon?: LucideIcon | undefined
  iconTone?: BadgeTone | undefined
  title: string
  /** У правого края, после действий: кнопка справки (HelpButton) - что это за вид. */
  help?: ReactNode | undefined
  /** Справа: главное действие вида. */
  actions?: ReactNode | undefined
}
