import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../SendModal.module.scss'
import type { CardRowProps } from '../SendModal.types'
import { useScenarioName } from '../../tracker.hooks'

/**
 * Строка карточки в списке отправки: место в очереди, заголовок и её сценарий. Карточка без
 * сценария - бледная, с «Skipped»: в очереди она встанет пометкой, и очередь пройдёт мимо.
 */
export const CardRow = ({ card, index }: CardRowProps) => {
  const { t } = useTranslation()
  const name = useScenarioName(card.scenario)

  return (
    <li className={clsx(styles.item, !card.scenario && styles.placeholder)}>
      <span className={styles.index}>{index + 1}</span>
      <span className={styles.cardTitle}>{card.title}</span>
      <span className={styles.scenarioName}>{card.scenario ? name : t('tracker.send.passed')}</span>
    </li>
  )
}
