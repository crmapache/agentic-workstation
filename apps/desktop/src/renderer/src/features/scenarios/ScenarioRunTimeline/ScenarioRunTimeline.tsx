import { useMemo } from 'react'

import { isRunFinished } from '@shared/scenario-runs'

import { lastToldAt } from '../scenarios-run.utils'
import { stepWorked, timelineOf } from '../scenarios-timeline.utils'
import styles from './ScenarioRunTimeline.module.scss'
import type { ScenarioRunTimelineProps } from './ScenarioRunTimeline.types'
import { NoteRow } from './parts/NoteRow'
import { StageRow } from './parts/StageRow'
import { StepRow } from './parts/StepRow'

/**
 * Таймлайн прогона (timeline.ts в ACC): этапы главами со своим вердиктом, шаги карточками,
 * слова головы, человека и IDE между ними - там, где сказаны. Циклы развёрнуты: какая из
 * шести строк идёт сейчас - единственный вопрос, что есть в полночь, и свёрнутый цикл на него
 * не отвечает. Где прогон - читается положением на рельсе раньше слова.
 */
export const ScenarioRunTimeline = ({ run, now, onOpenLog }: ScenarioRunTimelineProps) => {
  const rows = useMemo(() => timelineOf(run), [run])
  const isOver = isRunFinished(run.state)
  const lastTold = lastToldAt(run.notes)

  return (
    <div className={styles.scenarioRunTimeline}>
      {rows.map((row) => {
        if (row.kind === 'stage') return <StageRow key={row.key} row={row} />

        if (row.kind === 'note') {
          return (
            <NoteRow
              key={row.key}
              rowKey={row.key}
              note={row.note}
              isOver={isOver}
              isAnswering={run.answering && row.note.who === 'person' && row.note.at === lastTold}
            />
          )
        }

        return (
          <StepRow
            key={row.key}
            row={row}
            worked={stepWorked(row.step, now, run)}
            onOpenLog={onOpenLog}
          />
        )
      })}
    </div>
  )
}
