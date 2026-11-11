import { isRunFinished } from '@shared/scenario-runs'

import styles from '../RunModal.module.scss'
import type { RunPageProps } from '../RunModal.types'
import { useNow } from '../../scenarios-clock.hooks'
import { CLOCK_TICK_MS } from '../../scenarios.constants'
import { ScenarioRunTimeline } from '../../ScenarioRunTimeline/ScenarioRunTimeline'
import { EndBanner } from './EndBanner'
import { LimitStrip } from './LimitStrip'
import { RunFacts } from './RunFacts'
import { RunQuestionCard } from './RunQuestionCard'

/**
 * Таймлайн прогона в теле окна, как стол ACC: строка цифр и дорога, итог законченного, ошибка,
 * лимит, вопрос - то, что читают первым, - и под ними этапы и шаги. Часы тикают, только пока
 * прогон идёт: у законченного всё - разность двух штампов.
 */
export const RunPage = ({ ref, place, run, onOpenLog }: RunPageProps) => {
  const isOver = isRunFinished(run.state)
  const now = useNow(!isOver, CLOCK_TICK_MS)

  return (
    <div ref={ref} className={styles.page}>
      <RunFacts run={run} now={now} />
      {isOver && <EndBanner run={run} />}
      {!isOver && run.error && <div className={styles.error}>{run.error}</div>}
      {!isOver && run.limit && <LimitStrip limit={run.limit} />}
      {!isOver && run.question && (
        <RunQuestionCard place={place} runId={run.id} question={run.question} />
      )}
      <ScenarioRunTimeline run={run} now={now} onOpenLog={onOpenLog} />
    </div>
  )
}
