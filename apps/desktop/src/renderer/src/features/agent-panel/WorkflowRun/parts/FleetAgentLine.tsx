import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../WorkflowRun.module.scss'
import type { FleetAgentLineProps } from '../WorkflowRun.types'
import { isDropped, fleetDotState, fleetAgentFacts } from '../../agents.utils'
import { useFeedScope } from '../../feed-scope.context'
import { useStreamsStore } from '../../streams.store'
import { StatusDot } from '../../StatusDot/StatusDot'

/**
 * Агент флота строкой: точка состояния, подпись, факты справа. Вся строка - кнопка: окно
 * с тем, что агент сказал, открывается поверх, а не раскрытием - ответ агента это
 * страница, под своей строкой она вытолкнула бы с экрана остальной флот.
 */
export const FleetAgentLine = ({ agent, itemId, live, now }: FleetAgentLineProps) => {
  const { t } = useTranslation()
  const { conversationId, readOnly } = useFeedScope()
  const openFleetAgent = useStreamsStore((state) => state.openFleetAgent)
  const dropped = isDropped(agent, live)
  // В очереди открывать нечего: ни задания, ни ответа - окно в пустоту хуже строки, которая не открывается.
  // В журнале (readOnly) окна агента нет вовсе: оно живёт в ленте панели.
  const canOpen =
    !readOnly && Boolean(conversationId) && Boolean(agent.prompt || agent.result || agent.agentId)
  const isQuiet = dropped || agent.state === 'queued' || agent.state === 'skipped'

  const handleOpen = () => openFleetAgent(conversationId, { itemId, index: agent.index })

  return (
    <button
      type="button"
      className={clsx(
        styles.agent,
        isQuiet && styles.quiet,
        agent.state === 'running' && !dropped && styles.active,
      )}
      disabled={!canOpen}
      onClick={handleOpen}>
      <StatusDot status={fleetDotState(agent, dropped)} />
      <span className={styles.label}>{agent.label}</span>
      <span className={styles.facts}>
        {fleetAgentFacts(t, agent, now, { dropped, withError: true })}
      </span>
    </button>
  )
}
