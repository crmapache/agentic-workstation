import { useState, useEffect } from 'react'

import styles from '../Composer.module.scss'
import type { GhostHintProps } from '../Composer.types'
import { caretRect } from '../../field-caret'

/**
 * Синтаксис аргумента серым прямо в поле - там, где встанет следующий символ, как в
 * терминале. Не часть поля: слой поверх, в черновик не попадает.
 */
export const GhostHint = ({ hint, fieldRef, boxRef }: GhostHintProps) => {
  const [place, setPlace] = useState<ReturnType<typeof caretRect>>(null)

  useEffect(() => {
    const update = () => {
      const root = fieldRef.current
      const box = boxRef.current

      setPlace(root && box ? caretRect(root, box) : null)
    }
    const frame = requestAnimationFrame(update)

    document.addEventListener('selectionchange', update)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', update)
    }
  }, [hint, fieldRef, boxRef])

  if (!place) return null

  return (
    <span
      className={styles.ghost}
      aria-hidden
      // eslint-disable-next-line no-restricted-syntax -- место каретки меняется на каждую букву
      style={{ left: place.left, top: place.top, lineHeight: `${place.height}px` }}>
      {hint}
    </span>
  )
}
