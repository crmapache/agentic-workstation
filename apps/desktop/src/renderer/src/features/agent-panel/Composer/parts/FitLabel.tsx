import styles from '../Composer.module.scss'
import type { FitLabelProps } from '../Composer.types'
import { FIT_CLIP } from '../../composer-fit.hooks'
import { firstLetter } from '../../composer-fit.utils'

/**
 * Подпись Queue и Send (как в ACC): на узкой панели кнопка сужается до первой буквы и не
 * дальше - буква своя коробка, остальное режется. Сколько отрезано, видит замер ряда.
 */
export const FitLabel = ({ text }: FitLabelProps) => {
  const [head, rest] = firstLetter(text)

  // Одной коробкой: зазор кнопки между иконкой и подписью не должен встать внутрь слова.
  return (
    <span className={styles.fitLabel}>
      <span className={styles.fitHead}>{head}</span>
      <span {...FIT_CLIP} className={styles.fitClip}>
        {rest}
      </span>
    </span>
  )
}
