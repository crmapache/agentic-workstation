import styles from './StatusDivider.module.scss'

/**
 * Черта между частями строки состояния. Ставится между всеми частями подряд: черта у края
 * и вторая подряд (часть между ними пуста - ещё нет цифр) не видны сами.
 */
export const StatusDivider = () => <span className={styles.statusDivider} aria-hidden />
