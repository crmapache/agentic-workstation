import { createPortal } from 'react-dom'

import { useDragPoint } from '../LibraryTab.hooks'
import styles from '../LibraryTab.module.scss'
import type { LiftedRowProps } from '../LibraryTab.types'
import { ShelfRow } from './ShelfRow'

/**
 * Копия несомой строки за рукой (LiftedRow и DragOverlay в ACC) - своим слоем поверх всего,
 * порталом в body: строку, переехавшую в другой список, сама строка за рукой не донесёт, а
 * системный снимок не перерисовать.
 */
export const LiftedRow = ({ carried, scenario, kit }: LiftedRowProps) => {
  const point = useDragPoint(carried.at)

  return createPortal(
    <div
      className={styles.lifted}
      // eslint-disable-next-line no-restricted-syntax -- место копии - рука, меняется на каждом движении
      style={{ left: point.x - carried.grabX, top: point.y - carried.grab, width: carried.width }}
      aria-hidden
      inert>
      <ShelfRow
        scenario={scenario}
        rowKey={carried.key}
        shelf={carried.place.shelf}
        hidden={false}
        kit={kit}
      />
    </div>,
    document.body,
  )
}
