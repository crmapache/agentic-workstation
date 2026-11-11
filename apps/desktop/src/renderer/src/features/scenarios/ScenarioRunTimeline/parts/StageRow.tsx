import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { RUN_ROW } from '../ScenarioRunTimeline.constants'
import styles from '../ScenarioRunTimeline.module.scss'
import type { StageRowProps } from '../ScenarioRunTimeline.types'
import { stageVerdictWords } from '../../scenarios-run.utils'

/**
 * Заголовок этапа - глава, а не подпись: номер на рельсе, «Stage 2 · Review, then fix», черта
 * и вердикт этапа - «done · 8m», «here now», «not reached», с размером («×3, until done»,
 * «7 items»). Строки под ним не надо пересчитывать, чтобы понять, где прогон.
 */
export const StageRow = ({ row }: StageRowProps) => {
  const { t } = useTranslation()
  const title = row.title
    ? t('scenarios.run.stage.titled', { index: row.index, title: row.title })
    : t('scenarios.run.stage.untitled', { index: row.index })

  return (
    <div
      className={clsx(styles.row, styles.stageRow, styles[row.standing])}
      {...{ [RUN_ROW]: row.key }}>
      <span className={styles.rail}>
        <span className={styles.stageNumber}>{row.index}</span>
      </span>
      <div className={styles.stageHead}>
        <span className={styles.stageTitle}>{title}</span>
        <span className={styles.stageLine} aria-hidden />
        <span className={styles.stageVerdict}>{stageVerdictWords(t, row)}</span>
      </div>
    </div>
  )
}
