import clsx from 'clsx'

import { useFadingLit, useMarksView, usePenDrawing } from './WalkthroughMarks.hooks'
import styles from './WalkthroughMarks.module.scss'
import { Spotlight } from './parts/Spotlight'
import { StrokeShape } from './parts/StrokeShape'

/**
 * Метки показа Walkthrough (ADR 0134, 0135) на всё окно меток поверх дисплея: подсветка модели -
 * затемнение всего, кроме нужного места, и пометки человека его инструментами. С инструментом в
 * руке окно ловит мышь и рисует им; иначе мышь проходит насквозь. Что рисовать, решает главный
 * процесс; в снимки модели окно не попадает.
 */
export const WalkthroughMarks = () => {
  const { width, height, lit, strokes, pen } = useMarksView()
  const fading = useFadingLit(lit)
  const { live, handlers } = usePenDrawing(pen)

  return (
    // eslint-disable-next-line no-restricted-syntax -- рисунок поверх экрана, а не иконка
    <svg
      className={clsx(styles.stage, pen && styles.drawing)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      {...handlers}>
      <Spotlight width={width} height={height} lit={fading.lit} leaving={fading.leaving} />
      {strokes.map((stroke) => (
        <StrokeShape key={stroke.id} stroke={stroke} />
      ))}
      {live && <StrokeShape stroke={live} live />}
    </svg>
  )
}
