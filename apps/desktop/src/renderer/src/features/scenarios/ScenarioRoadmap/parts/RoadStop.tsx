import clsx from 'clsx'
import { X, Check } from 'lucide-react'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { STOP_ICON_SIZE } from '../ScenarioRoadmap.constants'
import styles from '../ScenarioRoadmap.module.scss'
import type { RoadStopProps } from '../ScenarioRoadmap.types'
import { stopLook } from '../../scenarios-road.utils'

/**
 * Остановка дороги: сделанная - галочка, упавшая - крестик, пропущенная - пунктир, впереди -
 * номер. Текущая - номер в кольце, и пока прогон работает или ждёт, по кольцу бежит дуга.
 */
export const RoadStop = ({ stop, index, isHere, mood }: RoadStopProps) => {
  const look = stopLook(stop.state)

  return (
    <Tooltip label={stop.title || String(index + 1)}>
      <span
        className={clsx(styles.stop, styles[look], isHere && styles.here, isHere && styles[mood])}>
        {look === 'done' ? (
          <Check size={STOP_ICON_SIZE} strokeWidth={2.5} aria-hidden />
        ) : look === 'failed' ? (
          <X size={STOP_ICON_SIZE} strokeWidth={2.5} aria-hidden />
        ) : (
          index + 1
        )}
        {isHere && (mood === 'working' || mood === 'asking') && (
          <span className={styles.arc} aria-hidden />
        )}
      </span>
    </Tooltip>
  )
}
