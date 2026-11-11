import type { MouseEvent } from 'react'
import clsx from 'clsx'
import { Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { answerLabel } from '@shared/scenario-rules'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { OWN_PRESS, PAST_MARK_CHARS } from '../HistoryTab.constants'
import styles from '../HistoryTab.module.scss'
import type { PastRunRowProps } from '../HistoryTab.types'
import { formatCost, formatDuration } from '../../scenarios-format.utils'
import { endedLabel, momentLabel } from '../../scenarios-moments.utils'
import { runWorked } from '../../scenarios-timeline.utils'
import { ScenarioStatePill } from '../../ScenarioStatePill/ScenarioStatePill'

/**
 * Строка прошлого прогона: какой (имя и первый ответ - то, чем две ночи одного сценария
 * различаются), когда начат и кончился, сколько работал, во что обошёлся, чем кончился.
 * Звезда - метка человека и ничего больше: не сортирует и от удаления не защищает.
 */
export const PastRunRow = ({ run, now, words, onOpen, onStar, onDelete }: PastRunRowProps) => {
  const { t } = useTranslation()
  const mark = answerLabel(run.inputs, PAST_MARK_CHARS)
  const failure =
    run.state === 'failed' && run.failure ? t(`scenarios.history.failures.${run.failure}`) : ''
  const isOver = run.finishedAt > 0
  const pill = <ScenarioStatePill of="run" state={run.state} />

  const handleOpen = () => onOpen(run.id)

  const handlePress = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(OWN_PRESS)) return

    handleOpen()
  }

  return (
    <div
      className={clsx(styles.tableRow, styles.tableLine)}
      role="presentation"
      onClick={handlePress}>
      <button type="button" className={clsx(styles.colRun, styles.runOpen)} onClick={handleOpen}>
        <span className={styles.runName}>{run.scenarioName}</span>
        {mark && <span className={styles.mark}>{mark}</span>}
      </button>
      <span className={styles.colStarted}>{momentLabel(run.startedAt, words, now)}</span>
      <span className={styles.colFinished}>
        {isOver ? endedLabel(run.startedAt, run.finishedAt, words, now) : ''}
      </span>
      <span className={styles.colTook}>
        {isOver ? formatDuration(runWorked(run, run.finishedAt)) : ''}
      </span>
      <span className={styles.colCost}>{run.cost > 0 ? formatCost(run.cost) : ''}</span>
      <span className={styles.colState}>
        {failure ? <Tooltip label={failure}>{pill}</Tooltip> : pill}
      </span>
      <span className={styles.colStar}>
        <IconButton
          icon={Star}
          size="sm"
          label={run.starred ? t('scenarios.history.unstar') : t('scenarios.history.star')}
          active={run.starred}
          onClick={() => onStar(run)}
        />
      </span>
      <span className={styles.colDrop}>
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('scenarios.history.delete')}
          onClick={() => onDelete(run)}
        />
      </span>
    </div>
  )
}
