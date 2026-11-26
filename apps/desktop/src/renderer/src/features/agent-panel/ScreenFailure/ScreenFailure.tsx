import { useTranslation } from 'react-i18next'

import { toolsFailureText } from '../panel.utils'
import styles from './ScreenFailure.module.scss'
import type { ScreenFailureProps } from './ScreenFailure.types'

/** Почему экран плагинов или /config пуст: причина словами и текст CLI. */
export const ScreenFailure = ({ failure, detail }: ScreenFailureProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.screenFailure}>
      <div className={styles.text}>{toolsFailureText(t, failure, detail)}</div>
    </div>
  )
}
