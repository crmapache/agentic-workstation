import clsx from 'clsx'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import styles from '../StreamSwitcher.module.scss'
import type { CommandChipProps } from '../StreamSwitcher.types'
import { commandLabel } from '../StreamSwitcher.utils'
import { inputText } from '../../claude.utils'
import { StatusDot } from '../../StatusDot/StatusDot'
import { ChipClock } from './ChipClock'
import { CommandView } from './CommandView'

/**
 * Фоновая команда - не поток: своего журнала у неё нет. Чип - знак, что процесс жив, и он
 * стоит ровно столько, сколько процесс идёт. Нажатие открывает под ним саму команду
 * (CommandView), а не подсказку: длинную цепочку в подсказке не прочесть. Крестик
 * останавливает, как у агента.
 */
export const CommandChip = ({ tool, onStop }: CommandChipProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const command = inputText(tool.input, 'command')
  const description = inputText(tool.input, 'description')
  const label = commandLabel(command) || description
  const taskId = tool.task?.taskId ?? ''
  const startedAt = tool.task?.startedAt ?? 0

  const handleStop = () => onStop({ taskId, kind: 'command', subject: description || label })

  const handleStopFromView = () => {
    popover.close()
    handleStop()
  }

  return (
    <div className={clsx(styles.chip, styles.static, taskId && styles.stoppable)}>
      <button {...popover.triggerProps} type="button" className={styles.pick}>
        <StatusDot status="running" />
        <span className={styles.name}>{t('claudeCode.agents.streams.background')}</span>
        <ChipClock startedAt={startedAt} />
        {label && <span className={styles.meta}>{label}</span>}
      </button>
      {taskId && (
        <span className={styles.stop}>
          <IconButton
            icon={X}
            size="xs"
            label={t('claudeCode.agents.streams.stopCommand')}
            onClick={handleStop}
          />
        </span>
      )}
      <Popover {...popover.popoverProps} width="lg">
        {popover.isOpen && (
          <CommandView
            command={command}
            description={description}
            startedAt={startedAt}
            onStop={taskId ? handleStopFromView : null}
          />
        )}
      </Popover>
    </div>
  )
}
