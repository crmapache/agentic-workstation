import { ARROW_STROKE, CIRCLE_STROKE } from '../WalkthroughMarks.constants'
import styles from '../WalkthroughMarks.module.scss'
import type { MarkShapeProps } from '../WalkthroughMarks.types'
import {
  headPath,
  arrowPath,
  arrowShape,
  keepInside,
  smoothPath,
  circlePoints,
  spotlightPath,
} from '../WalkthroughMarks.utils'

/**
 * Одна метка: петля маркером проявляется, как будто её ведут рукой (длина пути - 1, чтобы
 * анимация штриха не зависела от размера), стрелка и затемнение - проступают.
 */
export const MarkShape = ({ mark, width, height }: MarkShapeProps) => {
  if (mark.kind === 'circle') {
    return (
      <path
        className={styles.circle}
        d={smoothPath(keepInside(circlePoints(mark.box, mark.id), width, height, CIRCLE_STROKE))}
        pathLength={1}
        strokeWidth={CIRCLE_STROKE}
      />
    )
  }

  if (mark.kind === 'spotlight') {
    return (
      <path
        className={styles.spotlight}
        d={spotlightPath(width, height, mark.box)}
        fillRule="evenodd"
      />
    )
  }

  const shape = arrowShape(mark.from, mark.to, ARROW_STROKE)

  return (
    <g className={styles.arrow}>
      <path d={arrowPath(shape)} />
      <path
        className={styles.head}
        d={headPath(shape)}
        strokeWidth={Math.max(1, ARROW_STROKE * 0.22)}
      />
    </g>
  )
}
