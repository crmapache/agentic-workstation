import { useTranslation } from 'react-i18next'

import type { PluginCatalog } from '@shared/claude-tools'
import { useQuery } from '@tanstack/react-query'

import { useClaudeState, useConversationHistory } from '../claude.queries'
import type { MenuScreenProps } from '../claude.types'
import { accountTitle } from '../AccountsScreen/AccountsScreen.utils'
import { QUERY_KEYS } from '../../../state/query-keys'
import type { MenuSummary } from './SideMenu.types'

/** Только то, что уже лежит в кэше: строка меню не должна будить процесс CLI. */
const useCached = <T>(queryKey: readonly unknown[]) =>
  useQuery<T>({ queryKey, enabled: false }).data

/**
 * Значения строк корня меню: сколько прошлых разговоров, сколько плагинов, какой аккаунт.
 * Плагины - из прошлого открытия их экрана: спросить заново значило бы поднять процесс CLI
 * ради цифры в строке.
 */
export const useMenuSummary = ({ project }: MenuScreenProps): MenuSummary => {
  const { t } = useTranslation()
  const { data: state } = useClaudeState()
  const { data: history } = useConversationHistory(project.id, true)
  const plugins = useCached<PluginCatalog>(QUERY_KEYS.pluginCatalog(project.id))
  const accounts = state?.accounts
  const account = accounts?.accounts.find((item) => item.id === accounts.current)

  return {
    history: history ? { text: String(history.length) } : null,
    plugins: plugins?.installed ? { text: String(plugins.installed.length) } : null,
    accounts: account
      ? {
          text: accountTitle(account, t),
          tone: account.signedIn === false ? 'danger' : account.signedIn ? 'success' : 'neutral',
        }
      : null,
  }
}
