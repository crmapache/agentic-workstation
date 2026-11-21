import type { CloudState, CloudKeyCode, CloudKeyOutcome } from '@shared/tracker'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Действия облака трекера (ADR 0102). Ответ главного процесса - новое состояние облака, оно сразу
 * в кэш. Ключ аккаунта окно не видит: показывает его и спрашивает подтверждение системное окно
 * главного процесса.
 */
export const useCloudActions = () => {
  const queryClient = useQueryClient()
  const put = (state: CloudState) => queryClient.setQueryData(QUERY_KEYS.cloudState, state)
  const settle = (outcome: CloudKeyOutcome): CloudKeyCode | null => {
    if (!outcome.ok) return outcome.code

    put(outcome.state)

    return null
  }

  /** Ключ аккаунта - системным окном с «Copy»: окно IDE его не получает. */
  const showKey = async () => put(await invoke('cloud:copyKey'))

  /** Ключ другого компьютера; null - принят, иначе код отказа (cancelled - «нет» в окне). */
  const connect = async (key: string) => settle(await invoke('cloud:useKey', { key }))

  /** Новый аккаунт вместо пропавшего ключа - после «да» в системном окне. */
  const startOver = async () => settle(await invoke('cloud:startOver'))

  const setEnabled = async (enabled: boolean) => put(await invoke('cloud:setEnabled', { enabled }))

  return { showKey, connect, startOver, setEnabled }
}
