import { useTranslation } from 'react-i18next'

import { isRunFinished } from '@shared/scenario-runs'

import styles from '../RunModal.module.scss'
import type { RunFactsProps } from '../RunModal.types'
import { readingsOf, roadMoodOf } from '../RunModal.utils'
import { roadOf, roadWidth } from '../../scenarios-road.utils'
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
      {stops.length > 0 && (
        <div
          className={styles.road}
          // eslint-disable-next-line no-restricted-syntax -- дорога занимает ровно свою ширину (число кружков приходит с прогоном), иначе показания уехали бы в дальний конец
          style={{ flexBasis: roadWidth(stops.length) }}>
          <ScenarioRoadmap stops={stops} mood={roadMoodOf(run.state)} />
        </div>
      )}
      <div className={styles.readings}>
        {readingsOf(t, run, now).map((reading) => (
          <span key={reading.key} className={styles.reading}>
            <span className={styles.readingKey}>{reading.label}</span>
            <span className={styles.readingValue}>{reading.value}</span>
          </span>
        ))}
      </div>
      <span className={styles.state}>
        <ScenarioStatePill of="run" state={run.state} limited={!isOver && Boolean(run.limit)} />
      </span>
    </div>
  )
}
