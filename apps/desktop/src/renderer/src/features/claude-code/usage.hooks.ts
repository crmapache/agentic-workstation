import { useEffect } from 'react'

import { useClaudeAccounts } from './claude-accounts.hooks'

/**
 * Просить главный процесс освежить лимиты аккаунтов: сразу и раз в interval, пока
 * компонент на экране. Чаще своего шага главный процесс аккаунт всё равно не спросит.
 */
export const useUsageRefresh = (accountIds: readonly string[], interval: number) => {
  const accounts = useClaudeAccounts()
  // Список - строкой: новый массив с теми же id не должен перезапускать опрос. JSON, а
  // не join: id обычного входа - пустая строка.
  const key = JSON.stringify(accountIds)

  useEffect(() => {
    const ids = JSON.parse(key) as string[]

    if (ids.length === 0) return

    const ask = () => void accounts.refreshUsage(ids)

    ask()

    const timer = window.setInterval(ask, interval)

    return () => window.clearInterval(timer)
  }, [accounts, key, interval])
}
