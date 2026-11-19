import { Plus, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useConnections } from '../connections.queries'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import { useConnectionsScreen } from './ConnectionsScreen.hooks'
import styles from './ConnectionsScreen.module.scss'
import { ConnectionCard } from './parts/ConnectionCard'
import { ConnectionDialog } from './parts/ConnectionDialog'
import { RemoveConnectionDialog } from './parts/RemoveConnectionDialog'

/**
 * Подключения панели открытых моделей (ADR 0084): откуда берутся модели. Ollama и LM Studio
 * находятся сами, когда запущены; OpenRouter и свой адрес добавляются здесь с ключом. Пояснения
 * - за «?» в шапке листа.
 */
export const ConnectionsScreen = () => {
  const { t } = useTranslation()
  const state = useConnections()
  const screen = useConnectionsScreen()

  if (!state) return null

  return (
    <PanelScreen
      title={t('agentPanel.menu.titles.connections.title')}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCw}
          disabled={screen.busy}
          onClick={screen.refresh}>
          {t('openModels.connections.checkAgain')}
        </Button>
      }>
      <ul className={styles.list}>
        {state.connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            busy={screen.busy}
            onCheck={screen.refresh}
            onEdit={screen.edit}
            onRemove={screen.askRemove}
          />
        ))}
      </ul>
      {!state.canStoreKeys && (
        <div className={styles.noKeys}>{t('openModels.connections.noKeys')}</div>
      )}
      <div className={styles.footer}>
        <Button
          variant="primary"
          icon={Plus}
          disabled={screen.busy || !state.canStoreKeys}
          onClick={screen.addOpenRouter}>
          {t('openModels.connections.addOpenRouter')}
        </Button>
        <Button icon={Plus} disabled={screen.busy} onClick={screen.addCustom}>
          {t('openModels.connections.addCustom')}
        </Button>
      </div>
      <ConnectionDialog
        key={screen.draft ? (screen.draft.id ?? `new-${screen.draft.kind}`) : 'none'}
        draft={screen.draft}
        canStoreKeys={state.canStoreKeys}
        failed={screen.failed}
        onSave={screen.save}
        onClose={screen.closeDraft}
      />
      <RemoveConnectionDialog
        connection={screen.removing}
        onConfirm={screen.confirmRemove}
        onClose={screen.closeRemove}
      />
    </PanelScreen>
  )
}
