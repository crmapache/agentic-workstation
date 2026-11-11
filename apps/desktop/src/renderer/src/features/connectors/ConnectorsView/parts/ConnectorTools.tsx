import { RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Section } from '@agentic-workstation/ui/Section'
import { Switch } from '@agentic-workstation/ui/Switch'

import { ACCESS_TONES } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { ConnectorPartProps } from '../ConnectorsView.types'
import { toolGroups, shortDescription } from '../ConnectorsView.utils'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Инструменты коннектора по ступеням доступа: у каждой ступени своя метка и свой список,
 * у каждого инструмента переключатель. Отправка людям выключена по умолчанию, и включить
 * её можно только здесь: модель до этих переключателей не дотягивается (ADR 0028) - это
 * объясняет «?» раздела. Перечитать список у сервиса - кнопкой в шапке раздела.
 */
export const ConnectorTools = ({ connector }: ConnectorPartProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const { id, tools } = connector
  const enabled = tools.filter((tool) => tool.enabled).length
  const canRefresh = connector.enabled && (connector.signedIn || !connector.signsIn)

  return (
    <Section
      size="sm"
      title={t('connectors.tools.title')}
      help={<ConnectorsHelp topic="tools" />}
      count={
        tools.length > 0 ? t('connectors.tools.count', { enabled, total: tools.length }) : undefined
      }
      actions={
        canRefresh && (
          <IconButton
            icon={RotateCw}
            size="sm"
            label={t('connectors.actions.refresh')}
            onClick={() => actions.refresh(id)}
          />
        )
      }>
      {tools.length === 0 && <p className={styles.hint}>{t('connectors.tools.none')}</p>}
      <div className={styles.toolGroups}>
        {toolGroups(tools).map((group) => (
          <div key={group.access} className={styles.toolGroup}>
            <div className={styles.toolGroupHead}>
              <Badge variant="soft" tone={ACCESS_TONES[group.access]}>
                {t(`connectors.tools.groups.${group.access}`)}
              </Badge>
            </div>
            <div className={styles.toolList}>
              {group.tools.map((tool) => (
                <Switch
                  key={tool.name}
                  label={tool.name}
                  description={shortDescription(tool.description)}
                  checked={tool.enabled}
                  onChange={(on) => actions.setToolEnabled(id, tool.name, on)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
