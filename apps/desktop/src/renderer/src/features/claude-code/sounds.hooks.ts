import { useRef } from 'react'

import type { ClaudeState } from '@shared/claude'
import type { WorkspaceState } from '@shared/workspace'
import { useQueryClient } from '@tanstack/react-query'

import { useIpcEvent } from '../../lib/ipc.hooks'
import { playSound } from '../../lib/sound-player'
import { useLayoutStore } from '../../state/layout.store'
import { QUERY_KEYS } from '../../state/query-keys'
import { useSoundPrefs } from '../../state/sounds.queries'
import { volumeOf } from '../../state/sounds.utils'
import type { LastSound } from './sounds.utils'
import { isWatched, passesGap, soundRank } from './sounds.utils'

/**
 * Звук, когда разговор позвал человека (событие claude:call). Решает главный процесс -
 * какой повод и звать ли вовсе (выключенные в Settings → Sounds не приходят); окно -
 * «оболочка»: играет с громкостью из звуков IDE, молчит, если человек и так смотрит на эту
 * вкладку, и из звуков подряд пропускает только более важный. Подписка одна на окно.
 */
export const useCallSounds = () => {
  const queryClient = useQueryClient()
  // Подписка держит настройку звуков загруженной с первого зова, а не с открытия настроек.
  const sounds = useSoundPrefs()
  const last = useRef<LastSound | null>(null)

  useIpcEvent('claude:call', (call) => {
    const state = queryClient.getQueryData<ClaudeState>(QUERY_KEYS.claudeState)
    const workspace = queryClient.getQueryData<WorkspaceState>(QUERY_KEYS.workspace)
    const project = workspace?.projects.find((item) => item.id === workspace.activeProjectId)
    const { provider } = useLayoutStore.getState()
    const now = Date.now()
    const view = {
      activeConversationId: (project && state?.activeByProject[project.rootPath]) ?? null,
      panelShown: provider.isOpen && provider.activeViewId === 'claude-code',
      windowFocused: document.hasFocus() && document.visibilityState === 'visible',
    }

    if (!state || isWatched(call, view) || !passesGap(last.current, call.reason, now)) return

    last.current = { at: now, rank: soundRank(call.reason) }
    playSound(call.reason, volumeOf(sounds, call.reason))
  })
}
