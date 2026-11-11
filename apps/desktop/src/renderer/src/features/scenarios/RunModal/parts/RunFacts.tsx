import { useTranslation } from 'react-i18next'

import { isRunFinished } from '@shared/scenario-runs'

import styles from '../RunModal.module.scss'
import type { RunFactsProps } from '../RunModal.types'
import { readingsOf, roadMoodOf } from '../RunModal.utils'
import { roadOf } from '../../scenarios-road.utils'
import { ScenarioReadings } from '../../ScenarioReadings/ScenarioReadings'
import { ScenarioRoadmap } from '../../ScenarioRoadmap/ScenarioRoadmap'
import { ScenarioStatePill } from '../../ScenarioStatePill/ScenarioStatePill'

/**
 * Строка над таймлайном: дорога карточек вместо «6/6 cards», время работы (идёт вживую, пока
 * прогон работает; паузы и вопросы человеку не считаются), токены, деньги, когда начат, и
 * плашка состояния в дальнем конце.
 */
export const RunFacts = ({ run, now }: RunFactsProps) => {
  const { t } = useTranslation()
  const isOver = isRunFinished(run.state)
  const stops = roadOf(run)

  return (
    <div className={styles.facts}>
      {/* Дорога своей ширины: иначе показания уехали бы в дальний конец строки. */}
      {stops.length > 0 && <ScenarioRoadmap stops={stops} mood={roadMoodOf(run.state)} ownWidth />}
      <ScenarioReadings readings={readingsOf(t, run, now)} />
      <span className={styles.state}>
        <ScenarioStatePill of="run" state={run.state} limited={!isOver && Boolean(run.limit)} />
      </span>
    </div>
  )
}
