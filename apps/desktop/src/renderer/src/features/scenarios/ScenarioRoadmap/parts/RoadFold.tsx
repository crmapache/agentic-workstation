import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../ScenarioRoadmap.module.scss'
import type { RoadFoldProps } from '../ScenarioRoadmap.types'
import { isFoldPassed } from '../../scenarios-road.utils'

/**
 * Складка «+N» - карточки, спрятанные, чтобы дорога влезла: плашка ростом с остановку в
 * пунктирной рамке, номера спрятанных - в подсказке. Все спрятанные сделаны - цвета галочек.
 */
export const RoadFold = ({ stops, fold }: RoadFoldProps) => {
  const { t } = useTranslation()
  const label = t('scenarios.common.folded', { from: fold.from + 1, to: fold.to + 1 })

  return (
    <Tooltip label={label}>
      <span
        className={clsx(styles.fold, isFoldPassed(stops, fold) && styles.foldPassed)}
        role="img"
        aria-label={label}>
        {t('scenarios.common.more', { count: fold.to - fold.from + 1 })}
      </span>
    </Tooltip>
  )
}
