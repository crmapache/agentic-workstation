import type { ReactNode } from 'react'

export type StatusBarProps = {
  /**
   * Кнопки других фич (Remote Control, все звуки IDE) - перед процессором и памятью, каждая
   * своей ячейкой через черту. Их кладёт workbench: строка состояния соседних фич не знает.
   */
  items?: readonly ReactNode[] | undefined
}
