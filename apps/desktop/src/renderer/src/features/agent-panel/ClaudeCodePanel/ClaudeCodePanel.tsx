import { useQueryClient } from '@tanstack/react-query'

import { ProviderPanel } from '../ProviderPanel/ProviderPanel'

/**
 * Правая панель Claude Code (ADR 0083): общая панель провайдера Claude. При перезагрузке
 * панели перечитываются и зеркала каналов Claude (ключ 'claude').
 */
export const ClaudeCodePanel = () => {
  const queryClient = useQueryClient()

  const handleReload = () => void queryClient.resetQueries({ queryKey: ['claude'] })

  return <ProviderPanel provider="claude" onReload={handleReload} />
}
