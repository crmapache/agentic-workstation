import { Fragment } from 'react'
import clsx from 'clsx'

import {
  endOf,
  bandOf,
  hereOf,
  roadLayout,
  bandedParts,
  isLinkPassed,
} from '../scenarios-road.utils'
import { NO_STOP } from './ScenarioRoadmap.constants'
import { useRoadMeasure } from './ScenarioRoadmap.hooks'
import styles from './ScenarioRoadmap.module.scss'
import type { ScenarioRoadmapProps } from './ScenarioRoadmap.types'
import { roadStopsStyle } from './ScenarioRoadmap.utils'
import { RoadFold } from './parts/RoadFold'
import { RoadStop } from './parts/RoadStop'

/**
 * Дорога карточек прогона (Roadmap в ACC): кружки на одном расстоянии, этап, где стоит прогон,
 * подложен одной сплошной полосой с круглыми концами, связка между сделанными - цвета успеха. Не
 * влезает - первая и последняя на месте, окно вокруг текущей и «+N».
 * У законченного прогона настоящего нет: ничего не выделено, окно смотрит туда, где он кончился.
 */
export const ScenarioRoadmap = ({ stops, mood, ownWidth = false }: ScenarioRoadmapProps) => {
  const { ref, probeRef, width, metrics } = useRoadMeasure()
  const isOver = mood === 'over'
  const here = isOver ? endOf(stops) : hereOf(stops)
  // Пока части не обмерены (первая раскладка до отрисовки), ряд пуст, а не сложен по догадке.
  const items = metrics ? roadLayout(stops.length, here, width, metrics) : []
  const banded = bandedParts(items, isOver ? null : bandOf(stops, here))
  // Круглые концы - у первой и последней НАРИСОВАННОЙ части этапа: этап, наполовину ушедший в
  // складку, всё равно читается отрезком с двумя концами.
  const bandStart = banded.indexOf(true)
  const bandEnd = banded.lastIndexOf(true)

  return (
    <div
      ref={ref}
      className={clsx(styles.scenarioRoadmap, styles[`band${mood}`], ownWidth && styles.ownWidth)}
      // eslint-disable-next-line no-restricted-syntax -- число остановок приходит с прогоном: по нему дорога своей ширины
      style={ownWidth ? roadStopsStyle(stops.length) : undefined}>
      <div ref={probeRef} className={styles.probe} aria-hidden>
        <span className={styles.stop} />
        <span className={styles.link} />
        <span className={styles.fold} />
      </div>
      <div className={styles.road}>
        {items.map((item, at) => (
          <Fragment key={item.kind === 'stop' ? `stop-${item.index}` : `fold-${item.from}`}>
            {at > 0 && (
              <span
                className={clsx(
                  styles.link,
                  isLinkPassed(stops, items, at) && styles.passed,
                  banded[at - 1] && banded[at] && styles.banded,
                )}
                aria-hidden
              />
            )}
            <span
              className={clsx(
                styles.place,
                banded[at] && styles.banded,
                at === bandStart && styles.bandStart,
                at === bandEnd && styles.bandEnd,
              )}>
              {item.kind === 'stop' ? (
                <RoadStop
                  stop={stops[item.index] ?? NO_STOP}
                  index={item.index}
                  isHere={!isOver && item.index === here}
                  mood={mood}
                />
              ) : (
                <RoadFold stops={stops} fold={item} />
              )}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
