import { useCallback } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { isDropped, fleetAgentOf, fleetDotState, fleetAgentFacts } from '../agents.utils'
import { TICK_MS } from '../claude.constants'
import { useNow } from '../clock.hooks'
import { useStreamsStore } from '../streams.store'
import { StatusDot } from '../StatusDot/StatusDot'
import { useEscapeToClose } from './FleetAgentView.hooks'
import styles from './FleetAgentView.module.scss'
import type { FleetAgentViewProps } from './FleetAgentView.types'
import { FleetAgentBody } from './parts/FleetAgentBody'

/**
 * Окно одного агента флота на месте ленты: задание целиком, его шаги и что он вернул -
 * на всю ширину панели, а не страницей под своей строкой. В шапке - те же факты, что
 * были в строке. Выход - крестик или Escape, назад к тому, что было под окном.
 */
export const FleetAgentView = ({ conversationId, itemId, index, items }: FleetAgentViewProps) => {
  const { t } = useTranslation()
  const closeFleetAgent = useStreamsStore((state) => state.closeFleetAgent)
  const found = fleetAgentOf(items, itemId, index)
  const dropped = found ? isDropped(found.agent, found.live) : false
  const now = useNow(found?.agent.state === 'running' && !dropped, TICK_MS)
  const handleClose = useCallback(
    () => closeFleetAgent(conversationId),
    [closeFleetAgent, conversationId],
  )

  useEscapeToClose(handleClose)

  if (!found) return null

  const { agent } = found

  return (
    <div className={styles.fleetAgentView} role="dialog" aria-label={agent.label}>
      <div className={styles.head}>
        <StatusDot status={fleetDotState(agent, dropped)} />
        <span className={styles.label}>{agent.label}</span>
        {/* Причина падения - в теле целиком: в шапке она читалась бы дважды. */}
        <span className={styles.facts}>
          {fleetAgentFacts(t, agent, now, { dropped, withError: false })}
        </span>
        {agent.model && <span className={styles.model}>{agent.model}</span>}
        <IconButton
          icon={X}
          size="sm"
          label={t('claudeCode.agents.fleet.close')}
          onClick={handleClose}
        />
      </div>
      <FleetAgentBody conversationId={conversationId} agent={agent} />
    </div>
  )
}
