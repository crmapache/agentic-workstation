import type { ConnectorsModalsProps } from '../ConnectorsView.types'
import { connectionsOf } from '../ConnectorsView.utils'
import { useConnectorsStore } from '../../connectors.store'
import { AiJobModal } from '../../AiJobModal/AiJobModal'
import { AddModal } from './AddModal'
import { ConnectorModal } from './ConnectorModal'
import { TypeModal } from './TypeModal'

/**
 * Окно по центру, какое открыто: подробности коннектора, добавление, свой тип из каталога или
 * работа ИИ. Коннектор, тип или работу убрали, пока окно было открыто, - окна нет.
 */
export const ConnectorsModals = ({ state, projects }: ConnectorsModalsProps) => {
  const panel = useConnectorsStore((store) => store.panel)

  if (panel?.kind === 'add') return <AddModal target={panel.target} google={state.google} />

  if (panel?.kind === 'aiJob') {
    const job = state.aiJobs.find((item) => item.id === panel.id)

    return job ? <AiJobModal key={job.id} job={job} /> : null
  }

  if (panel?.kind === 'type') {
    const type = state.types.find((item) => item.id === panel.id)

    return type ? (
      <TypeModal key={type.id} type={type} connections={connectionsOf(state, type.id)} />
    ) : null
  }

  const connector =
    panel?.kind === 'connector' ? state.connectors.find((item) => item.id === panel.id) : undefined
  const type = state.types.find((item) => item.id === connector?.typeId)

  return connector ? (
    <ConnectorModal
      key={connector.id}
      connector={connector}
      projects={projects}
      google={state.google}
      customType={type ? { type, connections: connectionsOf(state, type.id) } : null}
      browser={state.browser}
    />
  ) : null
}
