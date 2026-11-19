import { useTranslation } from 'react-i18next'

import { LabelRow } from '../NoticeRow/parts/LabelRow'
import styles from './ModLogRow.module.scss'
import type { ModLogRowProps } from './ModLogRow.types'

/**
 * Строка лога мода CLI в ленте (`ui_log`, как в ACC): имя мода и его слова, как он их
 * написал. Своего у панели здесь только подпись MOD.
 */
export const ModLogRow = ({ item }: ModLogRowProps) => {
  const { t } = useTranslation()

  return (
    <LabelRow label={t('agentPanel.mods.logLabel')}>
      <span className={styles.name}>{item.subject}</span> {item.detail}
    </LabelRow>
  )
}
