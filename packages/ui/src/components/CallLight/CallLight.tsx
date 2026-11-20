import type { CSSProperties, TransitionEvent } from 'react'
import { useState } from 'react'
import clsx from 'clsx'
import { Sparkle } from 'lucide-react'

import { CALL_SPARKS, CALL_PHASE_SPAN_MS } from './CallLight.constants'
import styles from './CallLight.module.scss'
import type { CallLightProps } from './CallLight.types'

/**
 * Свет позвавшего элемента - вкладки (ClosableTab call) или иконки полосы (IconButton call):
 * плоская плашка цветом повода и звёздочки по краям, как в ACC. Ставится внутрь хозяина с
 * position: relative и проступает или гаснет прозрачностью; повод держится, пока свет гаснет,
 * иначе цвет стекал бы в серый на выходе. Знак зова вне позвавшего - CallBeacon.
 */
export const CallLight = ({ call, since, calm = false }: CallLightProps) => {
  const [paint, setPaint] = useState(call ? { call, since } : null)

  if (call && (call !== paint?.call || since !== paint.since)) setPaint({ call, since })

  const phase = paint?.since === undefined ? 0 : -(paint.since % CALL_PHASE_SPAN_MS)

  const handleTransitionEnd = (event: TransitionEvent<HTMLSpanElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return
    if (!call) setPaint(null)
  }

  return (
    <span
      className={clsx(styles.callLight, paint && styles[paint.call], calm && styles.calm)}
      data-lit={call ? '' : undefined}
      // eslint-disable-next-line no-restricted-syntax -- фаза света - от момента зова, у каждого своя
      style={{ '--call-phase': `${phase}ms` } as CSSProperties}
      aria-hidden
      onTransitionEnd={handleTransitionEnd}>
      {paint && (
        <>
          <span className={styles.plaque} />
          {CALL_SPARKS.map((index) => (
            <span key={index} className={clsx(styles.spark, styles[`spark${index}`])}>
              <Sparkle fill="currentColor" aria-hidden />
            </span>
          ))}
        </>
      )}
    </span>
  )
}
