import type { ReactNode } from 'react'

export type StatusBarProps = {
  /**
   * Кнопки других фич (Remote Control) - перед процессором и памятью. Их кладёт workbench:
   * строка состояния соседних фич не знает.
   */
  items?: ReactNode | undefined
}
