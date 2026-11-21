import clsx from 'clsx'
import { AlarmClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import styles from '../StreamSwitcher.module.scss'
import type { WakeupChipProps } from '../StreamSwitcher.types'
import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../../panel.constants'
import { formatClock } from '../../panel.utils'
import { WakeCountdown } from './WakeCountdown'

/**
 * Будильник, который агент поставил себе: процесс CLI разбудит его сам. Чип говорит, что
 * разговор не стоит, а ждёт - до какого времени и сколько осталось; нажатие показывает, с чем
 * агент проснётся. Снять будильник IDE не может, поэтому крестика нет.
 */
export const WakeupChip = ({ tool }: WakeupChipProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const dueAt = tool.task?.dueAt ?? 0
  const prompt = tool.task?.activity ?? ''
  const clock = dueAt ? formatClock(dueAt) : ''

  return (
    <div className={clsx(styles.chip, styles.static)}>
      <button {...popover.triggerProps} type="button" className={styles.pick}>
        <AlarmClock
          className={styles.wakeIcon}
          size={ROW_ICON_SIZE}
          strokeWidth={ROW_ICON_STROKE}
          aria-hidden
        />
        <span className={styles.name}>{t('agentPanel.agents.streams.wakeup')}</span>
        {clock && <span className={styles.meta}>{clock}</span>}
        <WakeCountdown dueAt={dueAt} />
      </button>
      <Popover {...popover.popoverProps} width="lg">
        {popover.isOpen && (
          <div className={styles.commandView}>
            <div className={styles.commandHead}>
              <AlarmClock
                className={styles.wakeIcon}
                size={ROW_ICON_SIZE}
                strokeWidth={ROW_ICON_STROKE}
                aria-hidden
              />
              <span className={styles.commandTitle}>
                {t('agentPanel.agents.streams.wakeupTitle', { clock })}
              </span>
              <WakeCountdown dueAt={dueAt} />
            </div>
            {prompt && <div className={styles.subject}>{prompt}</div>}
          </div>
        )}
      </Popover>
    </div>
  )
}
