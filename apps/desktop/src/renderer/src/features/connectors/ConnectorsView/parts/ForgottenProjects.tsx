import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { projectsIn, moveProject, forgetProject } from '@shared/connector-availability'
import type { ConnectorAvailability } from '@shared/connector-availability'

import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import { NOTHING_SAID } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { ForgottenProjectsProps } from '../ConnectorsView.types'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Папки, которые помнят доступность или инструкции по проектам, но которых нет среди проектов
 * (переименовали, перенесли, давно не открывали). Настройку можно перенести на проект с новым
 * путём - «только здесь» и инструкции пойдут за папкой - или забыть. Инструкции, которые у
 * нового проекта уже есть, перенос не перетирает.
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

  // Запись нового пути и стирание старого - по очереди: обе меняют один список коннектора.
  const carry = async (path: string, to: string | null) => {
    for (const connector of connectors) {
      const said = connector.inProjects[path]

      if (!said) continue
      if (to && !connector.inProjects[to]) await actions.setInProject(connector.id, to, said)
      await actions.setInProject(connector.id, path, NOTHING_SAID)
    }
  }

  const handleForget = (path: string) => {
    apply(path, (availability) => forgetProject(availability, path))
    void carry(path, null)
  }

  const handleMove = (path: string, to: string) => {
    apply(path, (availability) => moveProject(availability, path, to))
    void carry(path, to)
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
                <Button size="sm" variant="secondary" onClick={() => handleStartMove(path)}>
                  {t('connectors.projects.move')}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => handleForget(path)}>
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
