import styles from './PanelScreen.module.scss'
import type { PanelScreenProps } from './PanelScreen.types'

/**
 * Тело экрана бокового меню: заголовок и стрелку назад рисует лист (Sheet), здесь -
 * ряд действий экрана («обновить»), плашка итога последнего действия и содержимое.
 */
export const PanelScreen = ({
  title,
  actions,
  notice,
  noticeAction,
  children,
}: PanelScreenProps) => (
  <section aria-label={title} className={styles.panelScreen}>
    {actions && <div className={styles.actions}>{actions}</div>}
    {notice && (
      <div role="status" className={styles.notice} data-tone={notice.tone}>
        <span className={styles.noticeText}>{notice.text}</span>
        {noticeAction}
      </div>
    )}
    {children}
  </section>
)
