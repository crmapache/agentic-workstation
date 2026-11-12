import clsx from 'clsx'

import { ALERT_ICONS, ALERT_ICON_SIZE } from './ScenarioAlert.constants'
import styles from './ScenarioAlert.module.scss'
import type { ScenarioAlertProps } from './ScenarioAlert.types'

/**
 * Строка, по которой человек действует сейчас: предупреждение (та же папка у двух очередей,
 * незакоммиченное) или отказ (провайдера нет, запуск или сохранение не вышли). Одна на все окна
 * и карточки сценариев: знак и слова, цвет - смыслом. Отказ угла окна - ScenarioNotice.
 */
export const ScenarioAlert = ({
  tone = 'warning',
  alert = false,
  children,
}: ScenarioAlertProps) => {
  const Icon = ALERT_ICONS[tone]

  return (
    <p role={alert ? 'alert' : undefined} className={clsx(styles.scenarioAlert, styles[tone])}>
      <Icon className={styles.icon} size={ALERT_ICON_SIZE} aria-hidden />
      <span>{children}</span>
    </p>
  )
}
