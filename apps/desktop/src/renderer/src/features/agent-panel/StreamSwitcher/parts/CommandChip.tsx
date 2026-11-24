import clsx from 'clsx'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import { SHELL_KEYS } from '../StreamSwitcher.constants'
import styles from '../StreamSwitcher.module.scss'
import type { CommandChipProps } from '../StreamSwitcher.types'
import { shellLabel, shellTaskOf } from '../StreamSwitcher.utils'
import { StatusDot } from '../../StatusDot/StatusDot'
import { ChipClock } from './ChipClock'
import { CommandView } from './CommandView'

/**
 * Фоновая команда или наблюдатель Monitor - не поток: своего журнала у них нет. Чип - знак, что
 * процесс жив, и он стоит ровно столько, сколько процесс идёт; у наблюдателя это значит, что
 * агент ждёт его событий. Нажатие открывает под ним саму команду (CommandView), а не подсказку:
 * длинную цепочку в подсказке не прочесть. Крестик останавливает, как у агента.
 */
export const CommandChip = ({ tool, onStop }: CommandChipProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const shell = shellTaskOf(tool)
  const keys = SHELL_KEYS[shell.kind]
  const label = shellLabel(shell)
  const taskId = tool.task?.taskId ?? ''
  const canStop = taskId !== '' && onStop !== null
  const startedAt = tool.task?.startedAt ?? 0

  const handleStop = () =>
    onStop?.({ taskId, kind: shell.kind, subject: shell.description || label })

  const handleStopFromView = () => {
    popover.close()
    handleStop()
  }

  return (
    <div className={clsx(styles.chip, styles.static, canStop && styles.stoppable)}>
      <button {...popover.triggerProps} type="button" className={styles.pick}>
        <StatusDot status="running" />
        <span className={styles.name}>{t(keys.name)}</span>
        <ChipClock startedAt={startedAt} />
        {label && <span className={styles.meta}>{label}</span>}
      </button>
      {canStop && (
        <span className={styles.stop}>
          <IconButton icon={X} size="xs" label={t(keys.stop)} onClick={handleStop} />
        </span>
      )}
      <Popover {...popover.popoverProps} width="lg">
        {popover.isOpen && (
          <CommandView
            shell={shell}
            startedAt={startedAt}
            onStop={canStop ? handleStopFromView : null}
          />
        )}
      </Popover>
    </div>
  )
}
