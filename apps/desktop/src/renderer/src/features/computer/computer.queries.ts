import type { CapsuleView, CapsuleAction } from '@shared/computer'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Что показывает капсула Computer Use: снимок при загрузке, дальше - события главного процесса
 * в тот же ключ кэша. Кнопки кладут ответ туда же, не дожидаясь события.
 */
export const useCapsule = () => {
  const client = useQueryClient()
  const { data } = useQuery({
    queryKey: QUERY_KEYS.computerCapsule,
    queryFn: () => invoke('computer:capsule'),
    staleTime: Infinity,
  })

  useIpcEvent('computer:capsuleChanged', (view) =>
    client.setQueryData(QUERY_KEYS.computerCapsule, view),
  )

  const control = async (action: CapsuleAction) => {
    client.setQueryData<CapsuleView | null>(
      QUERY_KEYS.computerCapsule,
      await invoke('computer:control', { action }),
    )
  }

  return { view: data ?? null, control }
}
