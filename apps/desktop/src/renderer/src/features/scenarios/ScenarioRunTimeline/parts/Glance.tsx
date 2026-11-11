import { Suspense } from 'react'
import clsx from 'clsx'

import { useGlanceCut } from '../ScenarioRunTimeline.hooks'
import styles from '../ScenarioRunTimeline.module.scss'
import type { GlanceProps } from '../ScenarioRunTimeline.types'
import { useConversationLog } from '../../../../state/conversation-log.context'

/**
 * Текст агента в таймлайне (Glance в ACC): Markdown тем же разбором, что в ленте провайдера
 * (его даёт workbench через ConversationLogContext), но мелко. Пока разбор грузится или его нет
 * вовсе (витрина, тест) - тот же текст как есть. Обрезка - три строки по высоте: законченный
 * показывает начало, говорящий - последние строки; край затухает, только когда правда обрезано.
 */
export const Glance = ({
  text,
  isClamped = false,
  isNewest = false,
  isInert = true,
}: GlanceProps) => {
  const log = useConversationLog()
  const { boxRef, isCut } = useGlanceCut(isClamped)
  const plain = <div className={styles.plain}>{text}</div>

  return (
    <div
      ref={boxRef}
      className={clsx(
        styles.glance,
        isClamped && styles.clamped,
        isNewest && styles.newest,
        isCut && styles.cut,
      )}>
      <div className={styles.glanceText} inert={isInert}>
        {log ? (
          <Suspense fallback={plain}>
            <log.Text text={text} />
          </Suspense>
        ) : (
          plain
        )}
      </div>
    </div>
  )
}
