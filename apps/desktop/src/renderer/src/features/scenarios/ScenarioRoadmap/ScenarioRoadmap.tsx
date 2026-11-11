import { Fragment } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { endOf, bandOf, hereOf, roadLayout } from '../scenarios-road.utils'
import { NO_STOP } from './ScenarioRoadmap.constants'
import { useRoadMeasure } from './ScenarioRoadmap.hooks'
import styles from './ScenarioRoadmap.module.scss'
import type { ScenarioRoadmapProps } from './ScenarioRoadmap.types'
import { roadStopsStyle } from './ScenarioRoadmap.utils'
import { RoadStop } from './parts/RoadStop'

/**
 * Дорога карточек прогона (Roadmap в ACC): кружки на одном расстоянии, этап, где стоит прогон,
 * подложен полосой. Не влезает - первая и последняя на месте, окно вокруг текущей и «+N».
 * У законченного прогона настоящего нет: ничего не выделено, окно смотрит туда, где он кончился.
 */
export const ScenarioRoadmap = ({ stops, mood, ownWidth = false }: ScenarioRoadmapProps) => {
  const { t } = useTranslation()
  const { ref, probeRef, width, metrics } = useRoadMeasure()
  const isOver = mood === 'over'
  const here = isOver ? endOf(stops) : hereOf(stops)
  // Пока части не обмерены (первая раскладка до отрисовки), ряд пуст, а не сложен по догадке.
  const items = metrics ? roadLayout(stops.length, here, width, metrics) : []
  const band = isOver ? null : bandOf(stops, here)
  const inBand = (index: number) => band !== null && index >= band.from && index <= band.to

  return (
    <div
      ref={ref}
      className={clsx(styles.scenarioRoadmap, ownWidth && styles.ownWidth)}
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
