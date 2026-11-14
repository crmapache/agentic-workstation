import { useTranslation } from 'react-i18next'

import { withMode } from '@shared/connector-availability'
import type { ConnectorAvailability } from '@shared/connector-availability'

import { Section } from '@agentic-workstation/ui/Section'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { AVAILABILITY_MODES } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { ProjectsPickerProps } from '../ConnectorsView.types'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { ConnectorsHelp } from './ConnectorsHelp'
import { ProjectChips } from './ProjectChips'

/**
 * В каких проектах коннектор виден (ADR 0029): во всех - выбирать нечего, проектов не
 * видно; только в отмеченных - плашки проектов (ProjectChips). «Только» возвращает отмеченные
 * в прошлый раз, в первый раз - ни одного (ADR 0054).
 */
export const ProjectsPicker = ({ connector, projects }: ProjectsPickerProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const { availability } = connector

  const handleMode = (mode: ConnectorAvailability['mode']) =>
    actions.setAvailability(connector.id, withMode(availability, mode))

  return (
    <Section
      size="sm"
      title={t('connectors.projects.title')}
      help={<ConnectorsHelp topic="projects" />}>
      <div className={styles.stack}>
        <Tabs
          label={t('connectors.projects.title')}
          items={AVAILABILITY_MODES.map((mode) => ({
            id: mode,
            label: t(`connectors.projects.modes.${mode}`),
          }))}
          value={availability.mode}
          fill
          onChange={handleMode}
        />
        {availability.mode === 'only' && (
          <ProjectChips connector={connector} selected={availability} projects={projects} />
        )}
      </div>
    </Section>
  )
}
