import { useState, useCallback } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { streamAgents, pendingWakeups, runningCommands, selectedStreamOf } from '../agents.utils'
import { usePanelCapabilities } from '../panel.queries'
import { useStreamsStore } from '../streams.store'
import { StatusDot } from '../StatusDot/StatusDot'
import { useWheelToSide } from '../../../lib/wheel-to-side.hooks'
import styles from './StreamSwitcher.module.scss'
import type { StopTarget, StreamSwitcherProps } from './StreamSwitcher.types'
import { AgentChip } from './parts/AgentChip'
import { CommandChip } from './parts/CommandChip'
import { StopTaskDialog } from './parts/StopTaskDialog'
import { WakeupChip } from './parts/WakeupChip'

/**
 * Чипы потоков над лентой: main первым, дальше живые агенты по порядку запуска, фоновые
 * команды и будильник агента. Нажатие на агента показывает его журнал на месте ленты, как
 * вкладки. Ряда нет, пока показывать нечего: до первого агента место над лентой лучше оставить.
 */
export const StreamSwitcher = ({ conversation, items }: StreamSwitcherProps) => {
  const { t } = useTranslation()
  const selection = useStreamsStore((state) => state.byConversation[conversation.id])
  const pickStream = useStreamsStore((state) => state.pickStream)
  const [stopping, setStopping] = useState<StopTarget | null>(null)
  const onStop = usePanelCapabilities().stopTask ? setStopping : null
  const attachWheel = useWheelToSide()
  const activeId = selectedStreamOf(selection, items)?.itemId ?? null
  const agents = streamAgents(items, activeId)
  const commands = runningCommands(items)
  const wakeups = pendingWakeups(items)

  // Стабильный: чипы агентов мемоизированы и не перерисовываются от каждого тика ряда.
  const handlePick = useCallback(
    (itemId: string | null) => pickStream(conversation.id, itemId),
    [pickStream, conversation.id],
  )

  const handlePickMain = () => handlePick(null)

  const handleCloseStop = () => setStopping(null)

  if (agents.length === 0 && commands.length === 0 && wakeups.length === 0) return null

  return (
    <div className={styles.streamSwitcher}>
      <div
        ref={attachWheel}
        role="group"
        className={styles.list}
        aria-label={t('agentPanel.agents.streams.label')}>
        <div className={clsx(styles.chip, activeId === null && styles.active)}>
          <button
            type="button"
            className={styles.pick}
            aria-pressed={activeId === null}
            onClick={handlePickMain}>
            {conversation.status !== 'idle' && <StatusDot status={conversation.status} />}
            <span className={styles.name}>{t('agentPanel.agents.streams.main')}</span>
          </button>
        </div>
        {agents.map((tool) => (
          <AgentChip
            key={tool.id}
            tool={tool}
            isActive={tool.id === activeId}
            onPick={handlePick}
            onStop={onStop}
          />
        ))}
        {commands.map((tool) => (
          <CommandChip key={tool.id} tool={tool} onStop={onStop} />
        ))}
        {wakeups.map((tool) => (
          <WakeupChip key={tool.id} tool={tool} />
        ))}
      </div>
      {stopping && (
        <StopTaskDialog
          conversationId={conversation.id}
          target={stopping}
          onClose={handleCloseStop}
        />
      )}
    </div>
  )
}
