import clsx from 'clsx'

import styles from '../SettingsDialog.module.scss'
import type { SettingRowProps } from '../SettingsDialog.types'

/**
 * Строка настройки в карточке раздела: подпись и пояснение слева, управление справа ровным
 * столбцом, строки разделены линией. Каждая настройка читается отдельной строкой, а не
 * сливается с соседней.
 */
export const SettingRow = ({ label, description, dimmed = false, children }: SettingRowProps) => (
  <div className={clsx(styles.row, dimmed && styles.dimmed)}>
    <div className={styles.rowText}>
      <span className={styles.rowLabel}>{label}</span>
      {description && <span className={styles.rowDescription}>{description}</span>}
    </div>
    <div className={styles.rowControl}>{children}</div>
  </div>
)
