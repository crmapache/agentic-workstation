import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Switch } from '@agentic-workstation/ui/Switch'

import { KIND_ICONS, KIND_TONES, STATUS_TONES } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { ConnectorModalProps } from '../ConnectorsView.types'
import { connectorNames, instructionProjects } from '../ConnectorsView.utils'
import { useConnectorsStore } from '../../connectors.store'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { useActiveProject } from '../../../../state/workspace.queries'
import { BrowserSetup } from './BrowserSetup'
import { ComputerSetup } from './ComputerSetup'
import { ConnectorConnection } from './ConnectorConnection'
import { ConnectorDescription } from './ConnectorDescription'
import { ConnectorSignIn } from './ConnectorSignIn'
import { ConnectorTools } from './ConnectorTools'
import { CustomTypeSettings } from './CustomTypeSettings'
import { ProjectInstructions } from './ProjectInstructions'
import { ProjectsPicker } from './ProjectsPicker'
import { RemoveConnector } from './RemoveConnector'

/**
 * Подробности коннектора окном по центру: в шапке - имя, как на плитке, состояние и
 * «включён для AI», слева - свой тип (имя, «несколько раз»), описание, инструкции по проектам,
 * где он виден, подключение и проекты, справа - инструменты, в подвале - вход слева и удаление
 * справа. Плитка в сетке - только сводка, всё меняется здесь.
 */
export const ConnectorModal = ({
  connector,
  projects,
  google,
  customType,
  browser,
  computer,
}: ConnectorModalProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const close = useConnectorsStore((store) => store.close)
  const activeProject = useActiveProject()
  const instructed = instructionProjects(projects, connector.availability, activeProject?.rootPath)
  const { id, kind, tools } = connector
  const names = connectorNames(connector, t(`connectors.kinds.${kind}.short`))

  return (
    <Modal
      open
      size="lg"
      icon={KIND_ICONS[kind]}
      iconTone={KIND_TONES[kind]}
      title={names.title}
      description={[
        names.second,
        connector.account,
        tools.length ? t('connectors.tile.tools', { count: tools.length }) : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      headerActions={
        <>
          <Badge tone={STATUS_TONES[connector.status]}>
            {t(`connectors.status.${connector.status}`)}
          </Badge>
          <Switch
            label={t('connectors.actions.enabled')}
            labelHidden
            checked={connector.enabled}
            onChange={(enabled) => actions.setEnabled(id, enabled)}
          />
        </>
      }
      footer={
        <>
          <ConnectorSignIn connector={connector} />
          <RemoveConnector connector={connector} />
        </>
      }
      closeLabel={t('connectors.modal.close')}
      onClose={close}>
      <div className={styles.modalLayout}>
        <div className={styles.columns}>
          <div className={styles.column}>
            {customType && (
              <CustomTypeSettings
                key={`${customType.type.id}:${customType.type.name}`}
                {...customType}
              />
            )}
            <ConnectorDescription key={id} connector={connector} />
            {instructed && (
              <ProjectInstructions
                key={`${id}:projects`}
                connector={connector}
                projects={instructed.projects}
                initial={instructed.initial}
                browser={browser}
              />
            )}
            {kind === 'browser' && <BrowserSetup browser={browser} />}
            {kind === 'computer' && <ComputerSetup computer={computer} />}
            {kind !== 'browser' && kind !== 'computer' && (
              <ConnectorConnection connector={connector} google={google} />
            )}
            <ProjectsPicker connector={connector} projects={projects} />
          </div>
          <div className={styles.toolsColumn}>
            <ConnectorTools connector={connector} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
