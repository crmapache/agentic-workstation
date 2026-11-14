import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { RollingLine } from '@agentic-workstation/ui/RollingLine'

import { ROLLING_SAMPLE_KEYS } from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Строка со сменой снизу вверх (RollingLine), как в капсуле Computer Use: кнопка ставит следующую
 * фразу, старая уезжает вверх. Длинная фраза режется многоточием.
 */
export const RollingLineSpecimen = () => {
  const { t } = useTranslation('showcase')
  const [index, setIndex] = useState(0)
  const key = ROLLING_SAMPLE_KEYS[index % ROLLING_SAMPLE_KEYS.length] ?? 'rolling1'

  const handleNext = () => setIndex((value) => value + 1)

  return (
    <Specimen label={t('specimens.rollingLine')}>
      <span className={styles.rollingSample}>
        <RollingLine text={t(`samples.${key}`)} />
      </span>
      <Button size="sm" onClick={handleNext}>
        {t('samples.rollingNext')}
      </Button>
    </Specimen>
  )
}
