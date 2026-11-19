import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PluginScope, PluginAction } from '@shared/claude-tools'
import { useQueryClient } from '@tanstack/react-query'

import { useToolsAction, usePluginCatalog } from '../claude-tools.queries'
import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'
import type { PluginsTab, PluginCommand } from './PluginsScreen.types'

/**
 * Экран плагинов: каталог от CLI (установленные, доступные, маркетплейсы), действия и
 * итог; каждое действие отвечает и каталогом после себя. Установка, которой нужна
 * команда маркетплейса, сначала показывает, что сказал CLI, и ждёт явного «всё равно
 * установить».
 */
export const usePluginsScreen = (projectId: string) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const catalog = usePluginCatalog(projectId)
  const [tab, setTab] = useState<PluginsTab>('installed')
  const [consentFor, setConsentFor] = useState<string | null>(null)

  const action = useToolsAction({
    run: (command: PluginCommand) => {
      switch (command.kind) {
        case 'act':
          return invoke('plugins:act', { projectId, ...command.request })
        case 'addMarketplace':
          return invoke('plugins:addMarketplace', { projectId, source: command.source })
        case 'removeMarketplace':
          return invoke('plugins:removeMarketplace', { projectId, name: command.name })
      }
    },
    describe: (command) => {
      switch (command.kind) {
        case 'act': {
          const { action: kind, pluginId } = command.request

          return {
            target: pluginId,
            success: t(`agentPanel.plugins.done.${kind}`, { name: pluginId }),
          }
        }
        case 'addMarketplace':
          return {
            target: 'marketplace',
            success: t('agentPanel.plugins.done.addMarketplace', { name: command.source }),
          }
        case 'removeMarketplace':
          return {
            target: command.name,
            success: t('agentPanel.plugins.done.removeMarketplace', { name: command.name }),
          }
      }
    },
    apply: ({ catalog: next }) =>
      queryClient.setQueryData(QUERY_KEYS.pluginCatalog(projectId), next),
  })

  const run = async (command: PluginCommand) => {
    const result = await action.start(command)
    const target = command.kind === 'act' ? command.request.pluginId : null

    setConsentFor(result?.needsConsent ? target : null)
  }

  return {
    catalog,
    tab,
    setTab,
    busy: action.busy,
    notice: action.notice,
    consentFor,
    refresh: () =>
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pluginCatalog(projectId) }),
    act: (action: PluginAction, pluginId: string, scope: PluginScope | '', consent = false) =>
      void run({ kind: 'act', request: { action, pluginId, scope, consent } }),
    addMarketplace: (source: string) => void run({ kind: 'addMarketplace', source }),
    removeMarketplace: (name: string) => void run({ kind: 'removeMarketplace', name }),
  }
}
