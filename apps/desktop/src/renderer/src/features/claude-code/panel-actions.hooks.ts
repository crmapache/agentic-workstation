import type { ClaudeState, Conversation } from '@shared/claude'
import type { PanelTerminalCommand } from '@shared/claude-panel'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'
import { useAsideActions } from './aside.queries'
import { useClaudeAccounts } from './claude-accounts.hooks'
import { useClaudeActions } from './claude-actions.hooks'
import { useClaudeCodeStore } from './claude-code.store'
import { useClaudeState } from './claude.queries'
import { fastAsked } from './fast-mode.utils'
import type { PanelAction, PanelCommandId } from './slash.types'

/** Чем кончилась команда в Терминале, если не открылась: это видно на экране аккаунтов. */
const TERMINAL_FAILURES = new Set(['design-no-account', 'open-failed'])

/**
 * Команды панели со своим действием в IDE (как в ACC): /rename, /btw, /fast, /login,
 * /logout, /design-login. Вход и выход - в Терминале, в хранилище аккаунта в работе;
 * отказ Терминала читать негде, кроме экрана аккаунтов, - туда и ведёт.
 */
export const usePanelActions = (
  conversation: Conversation | null,
): Partial<Record<PanelCommandId, PanelAction>> => {
  const queryClient = useQueryClient()
  const actions = useClaudeActions()
  const accounts = useClaudeAccounts()
  const asides = useAsideActions()
  const { data: state } = useClaudeState()
  const openMenu = useClaudeCodeStore((store) => store.openMenu)
  const setNaming = useClaudeCodeStore((store) => store.setNaming)

  const terminal = (command: PanelTerminalCommand) =>
    invoke('claudePanel:terminalCommand', { command })
      .then((next) => {
        queryClient.setQueryData<ClaudeState>(QUERY_KEYS.agentState('claude'), next)

        if (TERMINAL_FAILURES.has(next.accounts.lastOutcome ?? '')) openMenu('accounts')
      })
      .catch((error: unknown) => console.warn('[claude-code] Терминал не открылся:', error))

  return {
    login: () => void accounts.signIn(state?.accounts.current ?? ''),
    logout: () => void terminal('logout'),
    'design-login': () => void terminal('design-login'),
    ...(conversation && {
      // /rename без имени открывает поле на вкладке, с именем - переименовывает сразу.
      rename: (argument) => {
        const title = argument.trim()

        if (title) void actions.rename(conversation.id, title)
        else setNaming(conversation.id)
      },
      // Голый /btw открывает цепочку снова; вопрос уходит сбоку, ход идёт дальше.
      btw: (question) => void asides.ask(conversation.id, question),
      fast: (argument) =>
        void actions.setOptions(conversation.id, {
          fastMode: fastAsked(argument, conversation.fastMode),
        }),
    }),
  }
}
