import clsx from 'clsx'
import { X, Check } from 'lucide-react'

import { Spinner } from '@agentic-workstation/ui/Spinner'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { RING_TONES, STOP_ICON_SIZE } from '../ScenarioRoadmap.constants'
import styles from '../ScenarioRoadmap.module.scss'
import type { RoadStopProps } from '../ScenarioRoadmap.types'
import { stopLook } from '../../scenarios-road.utils'

/**
 * Остановка дороги: сделанная - галочка, упавшая - крестик, пропущенная - пунктир, впереди -
 * номер. Текущая - номер в кольце, и пока прогон работает или ждёт, кольцо - Spinner (ADR 0025):
 * дуга бежит по самому кольцу, номер внутри остаётся виден.
 */
export const RoadStop = ({ stop, index, isHere, mood }: RoadStopProps) => {
  const look = stopLook(stop.state)
  const ringTone = isHere ? RING_TONES[mood] : undefined

  return (
    <Tooltip label={stop.title || String(index + 1)}>
      <span
        className={clsx(
          styles.stop,
          styles[look],
          isHere && styles.here,
          isHere && styles[mood],
          ringTone && styles.spinning,
        )}>
        {look === 'done' ? (
          <Check size={STOP_ICON_SIZE} strokeWidth={2.5} aria-hidden />
        ) : look === 'failed' ? (
          <X size={STOP_ICON_SIZE} strokeWidth={2.5} aria-hidden />
        ) : (
          index + 1
        )}
        {ringTone && (
          <span className={styles.ring}>
            <Spinner size="around" tone={ringTone} />
          </span>
        )}
      </span>
    </Tooltip>
  )
}
