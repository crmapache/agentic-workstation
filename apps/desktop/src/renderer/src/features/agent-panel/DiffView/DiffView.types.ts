import type { DiffRow } from '../diff.utils'

export type DiffViewProps = {
  rows: readonly DiffRow[]
  /** Сколько строк видно, пока дифф не раскрыт; длиннее - строка «… N more lines». */
  collapsedRows?: number | undefined
  /**
   * Раскрыт ли дифф целиком - управляет хозяин (у правки стрелка в шапке делает то же).
   * Не задан - дифф помнит сам.
   */
  expanded?: boolean | undefined
  onToggle?: (() => void) | undefined
}
