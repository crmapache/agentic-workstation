import { useRef } from 'react'

import type { AgentPanelState } from '@shared/conversation'
import { useQueryClient } from '@tanstack/react-query'

import { useIpcEvent } from '../../lib/ipc.hooks'
import { playSound } from '../../lib/sound-player'
import { QUERY_KEYS } from '../../state/query-keys'
import { useSoundPrefs } from '../../state/sounds.queries'
import { volumeOf, isAudible } from '../../state/sounds.utils'
import { currentCallView } from './call-view'
import type { LastSound } from './sounds.utils'
import { isWatched, passesGap, soundRank } from './sounds.utils'

/**
 * Звук, когда разговор позвал человека (событие agent:call). Решает главный процесс -
 * какой повод и звать ли вовсе (выключенные в Settings → Sounds не приходят); окно -
 * «оболочка»: играет с громкостью из звуков IDE, молчит, если человек и так смотрит на эту
 * вкладку, и из звуков подряд пропускает только более важный. Все звуки выключены разом (шапка
 * окна) - молчит, а свет вкладки и точку проекта зов ставит сам. Подписка одна на окно.
 */
export const useCallSounds = () => {
  const queryClient = useQueryClient()
  // Подписка держит настройку звуков загруженной с первого зова, а не с открытия настроек.
  const sounds = useSoundPrefs()
  const last = useRef<LastSound | null>(null)

  useIpcEvent('agent:call', ({ provider: owner, call }) => {
    const state = queryClient.getQueryData<AgentPanelState>(QUERY_KEYS.agentState(owner))
    const now = Date.now()
    const view = currentCallView(queryClient, owner)

    if (!state || !isAudible(sounds, call.reason) || isWatched(call, view)) return
    if (!passesGap(last.current, call.reason, now)) return

    last.current = { at: now, rank: soundRank(call.reason) }
    playSound(call.reason, volumeOf(sounds, call.reason))
  })
}
