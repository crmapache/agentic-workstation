import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'

import type { ConnectionCardProps } from '../ConnectionsScreen.types'
import { creditsLine, withoutTools, connectionState } from '../ConnectionsScreen.utils'
import { SettingsItem } from '../../SettingsItem/SettingsItem'

/**
 * Подключение: имя, состояние (сколько моделей работает, не запущено, ключ не принят), адрес и
 * сколько моделей не предлагается без инструментов. Найденные на этом компьютере (Ollama, LM
 * Studio) только проверяются заново; свои - правятся и убираются.
 */
export const ConnectionCard = ({
  connection,
  busy,
  onCheck,
  onEdit,
  onRemove,
}: ConnectionCardProps) => {
  const { t } = useTranslation()
  const state = connectionState(connection, t)
  const hidden = withoutTools(connection)

  return (
    <SettingsItem
      title={connection.label}
      badges={
        <>
          <Badge tone={state.tone}>{state.text}</Badge>
          {connection.detected && <Badge>{t('openModels.connections.detected')}</Badge>}
        </>
      }
      details={[
        connection.baseUrl,
        creditsLine(connection, t),
        hidden > 0 && t('openModels.connections.noTools', { count: hidden }),
      ]}
      code
      error={connection.state === 'failed' ? connection.error : undefined}
      actions={
        <>
          <Button size="sm" disabled={busy} onClick={onCheck}>
            {t('openModels.connections.checkAgain')}
          </Button>
          {!connection.detected && (
            <>
              <Button size="sm" disabled={busy} onClick={() => onEdit(connection)}>
                {t('openModels.connections.edit')}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => onRemove(connection)}>
                {t('openModels.connections.remove')}
              </Button>
            </>
          )}
        </>
      }
    />
  )
}
