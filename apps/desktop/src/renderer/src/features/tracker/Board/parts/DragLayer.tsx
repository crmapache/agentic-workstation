import { clsx } from 'clsx'

import styles from '../Board.module.scss'
import type { DragLayerProps } from '../Board.types'

/**
 * Призрак того, что несут, под рукой и линия места, куда оно встанет. Положение меняется
 * каждым движением руки - поэтому прямо в style.
 */
export const DragLayer = ({ drag, title }: DragLayerProps) => (
  <>
    <div
      className={styles.ghost}
      aria-hidden
      // eslint-disable-next-line no-restricted-syntax -- место и размер идут за рукой
      style={{
        left: drag.x - drag.grab.dx,
        top: drag.y - drag.grab.dy,
        width: drag.grab.width,
        height: drag.grab.height,
      }}>
      <span className={styles.ghostTitle}>{title}</span>
    </div>
    {drag.mark && (
      <div
        className={clsx(styles.line, drag.mark.axis === 'h' ? styles.horizontal : styles.vertical)}
        aria-hidden
        // eslint-disable-next-line no-restricted-syntax -- линия места идёт за рукой
        style={
          drag.mark.axis === 'h'
            ? { left: drag.mark.x, top: drag.mark.y, width: drag.mark.length }
            : { left: drag.mark.x, top: drag.mark.y, height: drag.mark.length }
        }
      />
    )}
  </>
)
