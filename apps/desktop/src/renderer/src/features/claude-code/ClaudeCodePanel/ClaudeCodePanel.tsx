import { useQueryClient } from '@tanstack/react-query'

import { PanelProviderContext } from '../../../state/panel-provider.context'
import { PanelFrame } from './parts/PanelFrame'

/**
 * Правая панель Claude Code (ADR 0083): общая панель провайдера, которой сказано, что её
 * провайдер - Claude. Запросы, кэш и события внутри - по этому провайдеру; при перезагрузке
 * панели перечитываются и зеркала каналов Claude (ключ 'claude').
 */
export const ClaudeCodePanel = () => {
  const queryClient = useQueryClient()

  const handleReload = () => void queryClient.resetQueries({ queryKey: ['claude'] })

  return (
    <PanelProviderContext.Provider value="claude">
      <PanelFrame onReload={handleReload} />
    </PanelProviderContext.Provider>
  )
}
