import { useEffect } from 'react'

import { invoke } from '../../lib/ipc'
import { usePanelProvider } from '../../state/panel-provider.context'
import { usePutPanelState } from './panel-state.hooks'

/**
 * Просить главный процесс освежить лимиты аккаунтов панели своего провайдера: сразу и раз в
 * interval, пока компонент на экране. Чаще своего шага главный процесс аккаунт всё равно не
 * спросит.
 */
export const useUsageRefresh = (accountIds: readonly string[], interval: number) => {
  const provider = usePanelProvider()
  const put = usePutPanelState(provider)
  // Список - строкой: новый массив с теми же id не должен перезапускать опрос. JSON, а
  // не join: id обычного входа - пустая строка.
  const key = JSON.stringify(accountIds)

  useEffect(() => {
    const ids = JSON.parse(key) as string[]

    if (ids.length === 0) return

    const ask = () => void put(invoke('agent:refreshUsage', { provider, accountIds: ids }))

    ask()

    const timer = window.setInterval(ask, interval)

    return () => window.clearInterval(timer)
  }, [put, provider, key, interval])
}
