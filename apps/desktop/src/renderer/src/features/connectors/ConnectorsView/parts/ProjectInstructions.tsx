import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'

import styles from '../ConnectorsView.module.scss'
import type { ProjectInstructionsProps } from '../ConnectorsView.types'
import { ConnectorsHelp } from './ConnectorsHelp'
import { InProjectFields } from './InProjectFields'
import { ProjectSelect } from './ProjectSelect'

/**
 * Инструкции коннектора по проектам (ADR 0053): куда ходить, что и как человек предпочитает, у
 * Browser - профиль Chrome. Проект выбирается явно, начиная с открытого; модель получает
 * сказанное только в разговорах этого проекта. Что видит модель, объясняет «?».
 */
export const ProjectInstructions = ({
  connector,
  projects,
  initial,
  browser,
}: ProjectInstructionsProps) => {
  const { t } = useTranslation()
  const [projectPath, setProjectPath] = useState(initial)

  return (
    <Section
      size="sm"
      title={t('connectors.inProject.title')}
      help={<ConnectorsHelp topic="inProject" />}>
      <div className={styles.stack}>
        <ProjectSelect
          projects={projects}
          value={projectPath}
          said={Object.keys(connector.inProjects)}
          onPick={setProjectPath}
        />
        <InProjectFields
          key={projectPath}
          connector={connector}
          projectPath={projectPath}
          browser={browser}
        />
      </div>
    </Section>
  )
}
