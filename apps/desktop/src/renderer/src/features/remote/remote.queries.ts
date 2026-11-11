import type { RemoteView } from '@shared/remote'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { QUERY_KEYS } from '../../state/query-keys'

/** Remote Control (ADR 0041). Владелец - главный процесс, здесь зеркало вида целиком. */
export const useRemote = () =>
  useQuery({
    queryKey: QUERY_KEYS.remote,
    queryFn: () => invoke('remote:get'),
    staleTime: Infinity,
  })

/** Телефон подключился, ждёт Approve, код истёк - главный процесс шлёт вид сам. */
export const useRemoteSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('remote:state', (view) => queryClient.setQueryData(QUERY_KEYS.remote, view))
}

/** Действия окна Remote Control: каждый ответ - вид целиком, сразу в кэш. */
export const useRemoteActions = () => {
  const queryClient = useQueryClient()
  const act = useMutation({
    mutationFn: (run: () => Promise<RemoteView>) => run(),
    onSuccess: (view) => queryClient.setQueryData(QUERY_KEYS.remote, view),
  })
  const run = (call: () => Promise<RemoteView>) => act.mutate(call)

  return {
    setEnabled: (enabled: boolean) => run(() => invoke('remote:setEnabled', { enabled })),
    startPairing: () => run(() => invoke('remote:startPairing')),
    approve: () => run(() => invoke('remote:approve')),
    refuse: () => run(() => invoke('remote:refuse')),
    revoke: (deviceId: string) => run(() => invoke('remote:revoke', { deviceId })),
  }
}
