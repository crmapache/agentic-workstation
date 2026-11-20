import { useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'
import { RingMeter } from '@agentic-workstation/ui/RingMeter'

import styles from '../ConversationScreen.module.scss'
import { useNow } from '../../../../lib/now.hooks'
import { momentText } from '../../../../lib/time.utils'
import { percentText, conversationMeters } from '../../../../lib/usage.utils'

/**
 * Показания разговора над полем, как кольца под полем окна IDE: заполненность контекста и лимиты
 * аккаунта, на котором он идёт (пять часов, неделя). Подписи - на виду: подсказки, как в IDE, у
 * пальца нет. Нажатие раскрывает, когда окна сбросятся. Цифр нет - ряда нет.
 */
export const ConversationMeters = ({
  conversation,
  offset,
}: {
  conversation: ConversationWire
  /** Насколько часы IDE впереди часов телефона. */
  offset: number
}) => {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const [isOpen, setIsOpen] = useState(false)
  const meters = conversationMeters(t, conversation, now, offset)
  const resets = meters.filter((meter) => meter.resetsAt !== null)

  if (meters.length === 0) return null

  const handleToggle = () => setIsOpen((value) => !value)

  return (
    <div className={styles.metersBlock}>
      <button
        type="button"
        className={styles.meters}
        aria-label={t('conversation.meters.label')}
        aria-expanded={resets.length > 0 ? isOpen : undefined}
        onClick={handleToggle}>
        {meters.map((meter) => (
          <span key={meter.key} className={styles.meter}>
            <RingMeter
              value={meter.percent}
              tone={meter.tone}
              burning={meter.burning}
              label={`${meter.label} ${percentText(meter.percent)}`}
            />
            <span className={styles.meterLabel}>{meter.label}</span>
            {!meter.burning && (
              <span className={clsx(styles.meterValue, styles[meter.tone])}>
                {percentText(meter.percent)}
              </span>
            )}
          </span>
        ))}
      </button>
      {isOpen &&
        resets.map((meter) => (
          <span key={meter.key} className={styles.meterReset}>
            {t('conversation.meters.resets', {
              label: meter.label,
              when: momentText(meter.resetsAt ?? now, now),
            })}
          </span>
        ))}
    </div>
  )
}
