import clsx from 'clsx'

import { RING_WIDTH } from '../WalkthroughMarks.constants'
import styles from '../WalkthroughMarks.module.scss'
import type { SpotlightProps } from '../WalkthroughMarks.types'
import { cutoutOf, spotlightPath } from '../WalkthroughMarks.utils'

/**
 * Подсветка модели (ADR 0135): всё окно затемнено, кроме скруглённых вырезов вокруг подсвеченных
 * мест, у каждого выреза - светлая кайма. Новая подсветка вместо прежней ведёт вырез к себе
 * плавно (слот тот же), а не мигает; ушли все - затемнение гаснет.
 */
export const Spotlight = ({ width, height, lit, leaving }: SpotlightProps) => {
  if (lit.length === 0) return null

  return (
    <g className={clsx(styles.spotlight, leaving && styles.leaving)}>
      <path
        className={styles.dim}
        d={spotlightPath(
          width,
          height,
          lit.map(({ box }) => box),
        )}
        fillRule="evenodd"
      />
      {lit.map(({ slot, box }) => {
        const cutout = cutoutOf(box)

        return (
          <rect
            key={slot}
            className={styles.ring}
            x={cutout.x}
            y={cutout.y}
            width={cutout.width}
            height={cutout.height}
            rx={cutout.radius}
            strokeWidth={RING_WIDTH}
          />
        )
      })}
    </g>
  )
}
