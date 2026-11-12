import type { MouseEvent } from 'react'
import clsx from 'clsx'
import { Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { OWN_PRESS } from '../HistoryTab.constants'
import styles from '../HistoryTab.module.scss'
import type { PastRunRowProps } from '../HistoryTab.types'
import { formatCost, formatDuration } from '../../scenarios-format.utils'
import { answerChips } from '../../scenarios-forms.utils'
import { endedLabel, momentLabel } from '../../scenarios-moments.utils'
import { runWorked } from '../../scenarios-timeline.utils'
import { AccRunBadge } from '../../AccRunBadge/AccRunBadge'
import { ScenarioFormsAnswers } from '../../ScenarioFormsAnswers/ScenarioFormsAnswers'
import { ScenarioStatePill } from '../../ScenarioStatePill/ScenarioStatePill'

/**
 * Строка прошлого прогона: какой (имя и ответы - то, чем две ночи одного сценария различаются,
 * теми же чипами, что у записи очереди), когда начат и кончился, сколько работал, во что обошёлся,
 * чем кончился. Звезда - метка человека и ничего больше: не сортирует и от удаления не защищает.
 * Прогон плагина ACC - с меткой ACC и без звезды и удаления: его запись IDE не пишет.
 */
export const PastRunRow = ({ run, now, words, onOpen, onStar, onDelete }: PastRunRowProps) => {
  const { t } = useTranslation()
  const failure =
    run.state === 'failed' && run.failure ? t(`scenarios.history.failures.${run.failure}`) : ''
  const isOver = run.finishedAt > 0
  const hasAnswers = answerChips(run.inputs).length > 0
  const isAcc = run.origin === 'acc'
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
        {isAcc && <AccRunBadge />}
        {hasAnswers && (
          <span className={styles.answers}>
            <ScenarioFormsAnswers inputs={run.inputs} />
          </span>
        )}
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
        {!isAcc && (
          <IconButton
            icon={Star}
            size="sm"
            label={run.starred ? t('scenarios.history.unstar') : t('scenarios.history.star')}
            active={run.starred}
            onClick={() => onStar(run)}
          />
        )}
      </span>
      <span className={styles.colDrop}>
        {!isAcc && (
          <IconButton
            icon={Trash2}
            size="sm"
            label={t('scenarios.history.delete')}
            onClick={() => onDelete(run)}
          />
        )}
      </span>
    </div>
  )
}
