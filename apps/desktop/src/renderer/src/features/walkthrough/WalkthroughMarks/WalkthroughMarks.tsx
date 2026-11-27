import { useMarksView } from './WalkthroughMarks.hooks'
import styles from './WalkthroughMarks.module.scss'
import { MarkShape } from './parts/MarkShape'

/**
 * Метки показа Walkthrough (ADR 0134) на всё окно меток поверх дисплея: обводка маркером, стрелка,
 * затемнение. Окно не ловит мышь и не попадает в снимки модели; что рисовать, решает главный
 * процесс.
 */
export const WalkthroughMarks = () => {
  const { width, height, marks } = useMarksView()

  return (
    // eslint-disable-next-line no-restricted-syntax -- рисунок маркером поверх экрана, а не иконка
    <svg
      className={styles.stage}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden>
      {marks.map((mark) => (
        <MarkShape key={mark.id} mark={mark} width={width} height={height} />
      ))}
    </svg>
  )
}
