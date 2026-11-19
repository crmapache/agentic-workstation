import { useQueryClient } from '@tanstack/react-query'

import { ProviderPanel } from '../ProviderPanel/ProviderPanel'

/**
 * Правая панель открытых моделей (ADR 0084): OpenCode с моделями из подключений (Ollama, LM
 * Studio, OpenRouter, свой адрес). При перезагрузке панели перечитываются и подключения - их
 * зеркало лежит под своим ключом, вне состояния панели.
 */
export const OpenModelsPanel = () => {
  const queryClient = useQueryClient()

  const handleReload = () => void queryClient.resetQueries({ queryKey: ['openModels'] })

  return <ProviderPanel provider="opencode" onReload={handleReload} />
}
