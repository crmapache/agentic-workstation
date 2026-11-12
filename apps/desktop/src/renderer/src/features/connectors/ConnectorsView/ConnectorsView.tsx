import { Plug } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '@agentic-workstation/ui/PageHeader'

import { useConnectors } from '../../../state/connectors.queries'
import { useWorkspace } from '../../../state/workspace.queries'
import styles from './ConnectorsView.module.scss'
import { knownProjects, forgottenProjects } from './ConnectorsView.utils'
import { AddCatalog } from './parts/AddCatalog'
import { AiJobs } from './parts/AiJobs'
import { ConnectorGrid } from './parts/ConnectorGrid'
import { ConnectorsHelp } from './parts/ConnectorsHelp'
import { ConnectorsModals } from './parts/ConnectorsModals'
import { ForgottenProjects } from './parts/ForgottenProjects'

/**
 * Вид Connectors в середине окна (ADR 0028, 0029): шапка вида, под ней разделы - работы ИИ
 * над новыми коннекторами (ADR 0050), подключённые коннекторы плитками и каталог нового.
 * Подробности и формы - окном по центру. Всё состояние - у главного процесса, здесь только вид.
 */
export const ConnectorsView = () => {
  const { t } = useTranslation()
  const { data } = useConnectors()
  const { data: workspace } = useWorkspace()

  if (!data) return null

  const projects = knownProjects(workspace)
  const forgotten = forgottenProjects(data.connectors, projects)

  return (
    <div className={styles.view}>
      <PageHeader
        icon={Plug}
        title={t('connectors.title')}
        help={<ConnectorsHelp topic="page" />}
      />
      <div className={styles.scroller}>
        <div className={styles.page}>
          {!data.vault && <p className={styles.warning}>{t('connectors.vaultMissing')}</p>}
          {data.vaultReset && <p className={styles.warning}>{t('connectors.vaultReset')}</p>}
          <AiJobs jobs={data.aiJobs} />
          <ConnectorGrid connectors={data.connectors} projects={projects} />
          <AddCatalog types={data.types} />
          {forgotten.length > 0 && (
            <ForgottenProjects
              connectors={data.connectors}
              forgotten={forgotten}
              projects={projects}
            />
          )}
        </div>
      </div>
      <ConnectorsModals state={data} projects={projects} />
    </div>
  )
}
