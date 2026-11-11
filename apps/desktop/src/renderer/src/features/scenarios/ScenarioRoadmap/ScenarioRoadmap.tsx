import { Fragment } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { endOf, bandOf, hereOf, roadLayout } from '../scenarios-road.utils'
import { NO_STOP } from './ScenarioRoadmap.constants'
import { useRoadWidth } from './ScenarioRoadmap.hooks'
import styles from './ScenarioRoadmap.module.scss'
import type { ScenarioRoadmapProps } from './ScenarioRoadmap.types'
import { RoadStop } from './parts/RoadStop'

/**
 * Дорога карточек прогона (Roadmap в ACC): кружки на одном расстоянии, этап, где стоит прогон,
 * подложен полосой. Не влезает - первая и последняя на месте, окно вокруг текущей и «+N».
 * У законченного прогона настоящего нет: ничего не выделено, окно смотрит туда, где он кончился.
 */
export const ScenarioRoadmap = ({ stops, mood }: ScenarioRoadmapProps) => {
  const { t } = useTranslation()
  const { ref, width } = useRoadWidth()
  const isOver = mood === 'over'
  const here = isOver ? endOf(stops) : hereOf(stops)
  const items = roadLayout(stops.length, here, width)
  const band = isOver ? null : bandOf(stops, here)
  const inBand = (index: number) => band !== null && index >= band.from && index <= band.to

  return (
    <div ref={ref} className={styles.scenarioRoadmap}>
      <div className={styles.road}>
        {items.map((item, at) => (
          <Fragment key={item.kind === 'stop' ? `stop-${item.index}` : `fold-${item.from}`}>
            {at > 0 && <span className={styles.link} aria-hidden />}
            {item.kind === 'stop' ? (
              <span className={clsx(styles.place, inBand(item.index) && styles[`band${mood}`])}>
                <RoadStop
                  stop={stops[item.index] ?? NO_STOP}
                  index={item.index}
                  isHere={!isOver && item.index === here}
                  mood={mood}
                />
              </span>
            ) : (
              <span className={styles.fold}>
                {t('scenarios.common.more', { count: item.to - item.from + 1 })}
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
