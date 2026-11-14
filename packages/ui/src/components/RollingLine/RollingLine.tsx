import { useState } from 'react'
import clsx from 'clsx'

import styles from './RollingLine.module.scss'
import type { RollingLineEntry, RollingLineProps } from './RollingLine.types'

/**
 * Одна строка, которая сменяется перелистыванием снизу вверх, как строки состояния в приложениях:
 * что ИИ делает сейчас (капсула Computer Use). Старая уезжает вверх и гаснет, новая выезжает
 * снизу; не влезла - режется многоточием. Первая строка встаёт без движения. При «меньше
 * движения» смена мгновенная. Скринридеру - только новая: старая на выходе скрыта от него.
 */
export const RollingLine = ({ text }: RollingLineProps) => {
  const [current, setCurrent] = useState<RollingLineEntry>({ text, turn: 0 })
  const [leaving, setLeaving] = useState<RollingLineEntry | null>(null)

  if (text !== current.text) {
    setLeaving(current)
    setCurrent({ text, turn: current.turn + 1 })
  }

  const handleLeft = () => setLeaving(null)

  return (
    <span className={styles.rollingLine}>
      {leaving && (
        <span
          key={leaving.turn}
          className={clsx(styles.line, styles.leaving)}
          aria-hidden
          onAnimationEnd={handleLeft}>
          {leaving.text}
        </span>
      )}
      <span key={current.turn} className={clsx(styles.line, current.turn > 0 && styles.entering)}>
        {current.text}
      </span>
    </span>
  )
}
