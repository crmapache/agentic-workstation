import type { InboxState } from '@shared/inbox'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { playSound } from '../lib/sound-player'
import { useInboxUiStore } from './inbox-ui.store'
import { soundOfItem } from './inbox.utils'
import { useLayoutStore } from './layout.store'
import { QUERY_KEYS } from './query-keys'
import { useSoundPrefs } from './sounds.queries'
import { volumeOf, isSoundOn } from './sounds.utils'

/**
 * Уведомления IDE (ADR 0069). Владелец - главный процесс; здесь зеркало в кэше - его читают
 * вид уведомлений, число на его иконке, карточки в углу окна и окно прогона задания.
 */
export const useInbox = () =>
  useQuery({
    queryKey: QUERY_KEYS.inbox,
    queryFn: () => invoke('inbox:get'),
    staleTime: Infinity,
  })

/**
 * Подписки уведомлений, одна на окно: зеркало, карточка в углу и звук нового (кроме того, что
 * человек и так видит на открытом виде уведомлений) и переход по нажатому баннеру ОС.
 */
export const useInboxSync = () => {
  const queryClient = useQueryClient()
  // Подписка держит настройку звуков загруженной с первого уведомления.
  const sounds = useSoundPrefs()

  useIpcEvent('inbox:changed', (state) => {
    queryClient.setQueryData<InboxState>(QUERY_KEYS.inbox, state)
  })
  useIpcEvent('inbox:arrived', (item) => {
    const { main } = useLayoutStore.getState()
    const watching =
      main.isOpen && main.activeViewId === 'inbox' && document.visibilityState === 'visible'
    const sound = soundOfItem(item)

    if (!watching) useInboxUiStore.getState().pushToast(item.id)
    if (!watching && isSoundOn(sounds, sound)) playSound(sound, volumeOf(sounds, sound))
  })
  useIpcEvent('inbox:reveal', ({ itemId }) => {
    useInboxUiStore.getState().reveal(itemId)
    useLayoutStore.getState().showMainView('inbox')
  })
}
