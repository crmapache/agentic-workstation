import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Section } from '@agentic-workstation/ui/Section'
import { Tile } from '@agentic-workstation/ui/Tile'

import { KIND_ICONS, KIND_TONES, STATUS_TONES } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { ConnectorGridProps } from '../ConnectorsView.types'
import { connectorNames, connectorDetail, availabilitySummary } from '../ConnectorsView.utils'
import { useConnectorsStore } from '../../connectors.store'

/**
 * Подключённые коннекторы плитками: сколько колонок влезет, ряд переносится. На плитке -
 * сервис, подпись человека и чей он, где виден и сколько инструментов; всё остальное - в
 * окне по нажатию.
 */
export const ConnectorGrid = ({ connectors, projects }: ConnectorGridProps) => {
  const { t } = useTranslation()
  const panel = useConnectorsStore((store) => store.panel)
  const openConnector = useConnectorsStore((store) => store.openConnector)

  return (
    <Section
      title={t('connectors.listTitle')}
      count={connectors.length || undefined}
      description={connectors.length ? undefined : t('connectors.empty')}>
      <div className={styles.grid}>
        {connectors.map((connector) => {
          const names = connectorNames(connector, t(`connectors.kinds.${connector.kind}.short`))
          const where = availabilitySummary(connector.availability, projects)
          const meta = [
            t(`connectors.availability.${where.key}`, { count: where.count, name: where.name }),
            connector.tools.length
              ? t('connectors.tile.tools', { count: connector.tools.length })
              : '',
          ]

          return (
            <Tile
              key={connector.id}
              icon={KIND_ICONS[connector.kind]}
              iconTone={KIND_TONES[connector.kind]}
              title={names.title}
              description={[names.second, connectorDetail(connector)].filter(Boolean).join(' · ')}
              meta={meta.filter(Boolean).join(' · ')}
              status={
                <Badge tone={STATUS_TONES[connector.status]}>
                  {t(`connectors.status.${connector.status}`)}
                </Badge>
              }
              muted={!connector.enabled}
              selected={panel?.kind === 'connector' && panel.id === connector.id}
              onClick={() => openConnector(connector.id)}
            />
          )
        })}
      </div>
    </Section>
  )
}
