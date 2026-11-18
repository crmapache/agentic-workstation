import type { ClaudeState } from '@shared/claude'
import type { ProviderId } from '@shared/providers'
import type { WorkspaceState } from '@shared/workspace'
import type { QueryClient } from '@tanstack/react-query'

import { PROVIDER_VIEW_OF } from '../../state/layout.constants'
import { useLayoutStore } from '../../state/layout.store'
import { QUERY_KEYS } from '../../state/query-keys'

/** Что человек видит в момент зова: выбранную вкладку проекта, открыта ли панель, впереди ли окно. */
export type CallView = {
  activeConversationId: string | null
  panelShown: boolean
  windowFocused: boolean
}

/**
 * Смотрит ли человек туда, откуда зовут: выбранная вкладка активного проекта в панели
 * провайдера owner, панель открыта, окно впереди. Звук и свет вкладки решают по одному
 * виду (sounds.hooks.ts, tab-calls.hooks.ts).
 */
export const currentCallView = (queryClient: QueryClient, owner: ProviderId): CallView => {
  const state = queryClient.getQueryData<ClaudeState>(QUERY_KEYS.agentState(owner))
  const workspace = queryClient.getQueryData<WorkspaceState>(QUERY_KEYS.workspace)
  const project = workspace?.projects.find((item) => item.id === workspace.activeProjectId)
  const { provider } = useLayoutStore.getState()

  return {
    activeConversationId: (project && state?.activeByProject[project.rootPath]) ?? null,
    panelShown: provider.isOpen && provider.activeViewId === PROVIDER_VIEW_OF[owner],
    windowFocused: document.hasFocus() && document.visibilityState === 'visible',
  }
}
