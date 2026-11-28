import { PEN_CASING, PEN_STROKE, ARROW_STROKE } from '../WalkthroughMarks.constants'
import styles from '../WalkthroughMarks.module.scss'
import type { StrokeShapeProps } from '../WalkthroughMarks.types'
import { headPath, arrowPath, arrowShape, smoothPath } from '../WalkthroughMarks.utils'

/**
 * Пометка человека (ADR 0135): обводка - путь его руки, подчёркивание - прямая от начала к
 * концу, стрелка - как в Shotter, остриём туда, где он отпустил кнопку. Каждая - оранжевой линией
 * по тёмной подложке: видна и на светлом приложении, и на тёмном. live - он ведёт её сейчас.
 */
export const StrokeShape = ({ stroke, live = false }: StrokeShapeProps) => {
  const { pen, points } = stroke
  const first = points[0]
  const last = points.at(-1)

  if (!first || !last) return null

  if (pen === 'arrow') {
    const shape = arrowShape(first, last, ARROW_STROKE)

    return (
      <g className={live ? styles.live : styles.shown}>
        <path className={styles.arrowCasing} d={arrowPath(shape)} strokeWidth={PEN_CASING * 2} />
        <path className={styles.arrow} d={arrowPath(shape)} />
        <path
          className={styles.head}
          d={headPath(shape)}
          strokeWidth={Math.max(1, ARROW_STROKE * 0.22)}
        />
      </g>
    )
  }

  const d = pen === 'underline' ? smoothPath([first, last]) : smoothPath(points)

  return (
    <g className={live ? styles.live : styles.shown}>
      <path className={styles.casing} d={d} strokeWidth={PEN_STROKE + PEN_CASING * 2} />
      <path className={styles.ink} d={d} strokeWidth={PEN_STROKE} />
    </g>
  )
}
