import { memo } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { RingMeter } from '@agentic-workstation/ui/RingMeter'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../StreamSwitcher.module.scss'
import type { AgentChipProps } from '../StreamSwitcher.types'
import {
  agentType,
  isWorkflow,
  fleetPercent,
  agentDotState,
  agentDescription,
} from '../../agents.utils'
import { formatDuration } from '../../claude.utils'
import { StatusDot } from '../../StatusDot/StatusDot'
import { ChipClock } from './ChipClock'

/**
 * Чип агента: точка (у флота - кольцо доли законченных), тип, время и чем занят прямо
 * сейчас. Нажатие показывает его журнал на месте ленты; крестик останавливает агента -
 * он есть, пока CLI сообщил имя задачи и агент идёт.
 */
export const AgentChip = memo(({ tool, isActive, onPick, onStop }: AgentChipProps) => {
  const { t } = useTranslation()
  const fleet = tool.task?.fleet
  const percent = fleetPercent(tool)
  const label =
    isWorkflow(tool) && fleet
      ? t('claudeCode.agents.streams.workflow', { count: fleet.total })
      : agentType(tool, t)
  const activity = tool.task?.activity || agentDescription(tool)
  const isRunning = tool.status === 'running'
  const taskId = isRunning ? (tool.task?.taskId ?? '') : ''
  const finishedIn =
    !isRunning && tool.startedAt && tool.endedAt ? tool.endedAt - tool.startedAt : 0

  const handlePick = () => onPick(tool.id)

  const handleStop = () => onStop({ taskId, kind: 'agent', subject: activity || label })

  return (
    <div className={clsx(styles.chip, isActive && styles.active, taskId && styles.stoppable)}>
      <Tooltip label={activity} disabled={!activity}>
        <button type="button" className={styles.pick} aria-pressed={isActive} onClick={handlePick}>
          {percent === null ? (
            <StatusDot status={agentDotState(tool)} />
          ) : (
            <RingMeter value={percent} label={`${percent}%`} />
          )}
          <span className={styles.name}>{label}</span>
          {isRunning && <ChipClock startedAt={tool.startedAt} />}
          {finishedIn > 0 && <span className={styles.duration}>{formatDuration(finishedIn)}</span>}
          {/* Чем занят - строкой на самом чипе: подсказка не обновляется, пока висит, а
              занятие меняется по ходу; узкая, с многоточием. */}
          {activity && <span className={styles.meta}>{activity}</span>}
        </button>
      </Tooltip>
      {taskId && (
        <span className={styles.stop}>
          <IconButton
            icon={X}
            size="xs"
            label={t('claudeCode.agents.streams.stopAgent')}
            onClick={handleStop}
          />
        </span>
      )}
    </div>
  )
})

AgentChip.displayName = 'AgentChip'
