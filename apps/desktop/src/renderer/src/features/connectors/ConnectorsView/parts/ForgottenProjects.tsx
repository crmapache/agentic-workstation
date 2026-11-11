import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { projectsIn, moveProject, forgetProject } from '@shared/connector-availability'
import type { ConnectorAvailability } from '@shared/connector-availability'

import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../ConnectorsView.module.scss'
import type { ForgottenProjectsProps } from '../ConnectorsView.types'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Папки, которые помнит доступность, но которых нет среди проектов (переименовали,
 * перенесли, давно не открывали). Настройку можно перенести на проект с новым путём -
 * «только здесь» пойдёт за папкой - или забыть.
 */
export const ForgottenProjects = ({ connectors, forgotten, projects }: ForgottenProjectsProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const [moving, setMoving] = useState<string | null>(null)

  const apply = (
    path: string,
    change: (availability: ConnectorAvailability) => ConnectorAvailability,
  ) => {
    for (const connector of connectors) {
      if (projectsIn(connector.availability).includes(path)) {
        actions.setAvailability(connector.id, change(connector.availability))
      }
    }
  }

  const handleForget = (path: string) =>
    apply(path, (availability) => forgetProject(availability, path))

  const handleMove = (path: string, to: string) => {
    apply(path, (availability) => moveProject(availability, path, to))
    setMoving(null)
  }

  const handleStartMove = (path: string) => setMoving(moving === path ? null : path)

  return (
    <Section
      title={t('connectors.projects.forgotten')}
      count={forgotten.length}
      help={<ConnectorsHelp topic="forgotten" />}>
      {forgotten.map((path) => (
        <div key={path} className={styles.stack}>
          <div className={styles.forgottenRow}>
            <span className={styles.forgottenPath}>{path}</span>
            <div className={styles.buttons}>
              {projects.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => handleStartMove(path)}>
                  {t('connectors.projects.move')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => handleForget(path)}>
                {t('connectors.projects.forget')}
              </Button>
            </div>
          </div>
          {moving === path && (
            <div className={styles.buttons}>
              <span className={styles.hint}>{t('connectors.projects.moveTo')}</span>
              {projects.map((project) => (
                <Button
                  key={project.rootPath}
                  size="sm"
                  onClick={() => handleMove(path, project.rootPath)}>
                  {project.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </Section>
  )
}
