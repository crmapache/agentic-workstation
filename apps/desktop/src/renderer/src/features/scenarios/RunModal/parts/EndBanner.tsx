import clsx from 'clsx'
import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../RunModal.module.scss'
import type { EndBannerProps } from '../RunModal.types'
import { endWords, endDetails } from '../../scenarios-run.utils'
import { isResumable } from '../../scenarios-runs.utils'
import { useScenarioActions } from '../../scenarios.actions'

/**
 * Итог законченного прогона над таймлайном (стол ACC): всё готово, остановлен человеком на
 * такой-то карточке или встал на поломке - её словами. Кончившийся прогон - не конец работы:
 * остановленный или упавший подхватывается с места той же головой.
 */
export const EndBanner = ({ run }: EndBannerProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()

  const handleCarryOn = () => void actions.carryOn(run.id)

  return (
    <div className={clsx(styles.end, styles[run.state])}>
      <div className={styles.endText}>{endWords(t, run)}</div>
      {endDetails(t, run).map((line) => (
        <div key={line} className={styles.endDetail}>
          {line}
        </div>
      ))}
      {isResumable(run) && (
        <div className={styles.endActions}>
          <Tooltip label={t('scenarios.run.carryOnHint')}>
            <Button size="sm" variant="primary" icon={RotateCcw} onClick={handleCarryOn}>
              {t('scenarios.run.carryOn')}
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
