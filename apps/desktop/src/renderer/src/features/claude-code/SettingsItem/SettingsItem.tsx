import styles from './SettingsItem.module.scss'
import type { SettingsItemProps } from './SettingsItem.types'

/**
 * Элемент списка на экране настроек панели: плагин, маркетплейс, аккаунт.
 * Имя и метки, серые подробности, ошибка, содержимое и ряд кнопок; выбранный - рамкой
 * акцента, как всё «сейчас выбрано».
 */
export const SettingsItem = ({
  title,
  badges,
  meta,
  details,
  code = false,
  error,
  children,
  actions,
  selected = false,
}: SettingsItemProps) => {
  const lines = (details ?? []).filter((line): line is string => Boolean(line))

  return (
    <li className={styles.settingsItem} data-selected={selected || undefined}>
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        {badges}
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>
      {lines.map((line) => (
        <div key={line} className={styles.detail} data-code={code || undefined}>
          {line}
        </div>
      ))}
      {error && <div className={styles.error}>{error}</div>}
      {children}
      {actions && <div className={styles.actions}>{actions}</div>}
    </li>
  )
}
