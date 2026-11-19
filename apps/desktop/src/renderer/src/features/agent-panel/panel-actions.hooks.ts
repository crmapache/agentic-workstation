import type { Conversation } from '@shared/conversation'
import { isFastModeChecked } from '@shared/fast-mode'
import type { PanelTerminalCommand } from '@shared/panel-extras'

import { invoke } from '../../lib/ipc'
import { useAsideActions } from './aside.queries'
import { useConversationActions } from './conversation-actions.hooks'
import { fastAsked } from './fast-mode.utils'
import { usePanelAccounts } from './panel-accounts.hooks'
import { usePutPanelState } from './panel-state.hooks'
import { usePanelState, usePanelCapabilities } from './panel.queries'
import { usePanelStore } from './panel.store'
import type { PanelAction, PanelCommandId } from './slash.types'

/** Чем кончилась команда в Терминале, если не открылась: это видно на экране аккаунтов. */
const TERMINAL_FAILURES = new Set(['design-no-account', 'open-failed'])

/**
 * Команды панели со своим действием в IDE (как в ACC): /rename, /btw, /fast, /login,
 * /logout, /design-login - каждая, если провайдер её умеет. Вход и выход - в Терминале, в
 * хранилище аккаунта в работе; отказ Терминала читать негде, кроме экрана аккаунтов, -
 * туда и ведёт.
 */
export const usePanelActions = (
  conversation: Conversation | null,
): Partial<Record<PanelCommandId, PanelAction>> => {
  const putClaude = usePutPanelState('claude')
  const actions = useConversationActions()
  const panelAccounts = usePanelAccounts()
  const asides = useAsideActions()
  const { data: state } = usePanelState()
  const capabilities = usePanelCapabilities()
  const openMenu = usePanelStore((store) => store.openMenu)
  const setNaming = usePanelStore((store) => store.setNaming)

  const terminal = (command: PanelTerminalCommand) =>
    putClaude(invoke('claudePanel:terminalCommand', { command })).then((next) => {
      if (TERMINAL_FAILURES.has(next?.accounts.lastOutcome ?? '')) openMenu('accounts')
    })

  return {
    ...(capabilities.accounts !== 'none' && {
      login: () => void panelAccounts.signIn(state?.accounts.current ?? ''),
    }),
    // Выход: Claude - в Терминале (его /logout), Codex - сам Codex.
    ...(capabilities.accounts === 'claude' && {
      logout: () => void terminal('logout'),
      'design-login': () => void terminal('design-login'),
    }),
    ...(capabilities.accounts === 'codex' && {
      logout: () => void panelAccounts.signOut(state?.accounts.current ?? ''),
    }),
    ...(conversation && {
      // /rename без имени открывает поле на вкладке, с именем - переименовывает сразу.
      rename: (argument) => {
        const title = argument.trim()

        if (title) void actions.rename(conversation.id, title)
        else setNaming(conversation.id)
      },
    }),
    // Голый /btw открывает цепочку снова; вопрос уходит сбоку, ход идёт дальше.
    ...(conversation &&
      capabilities.sideQuestion && {
        btw: (question) => void asides.ask(conversation.id, question),
      }),
    ...(conversation &&
      capabilities.fastMode && {
        fast: (argument) =>
          void actions.setOptions(conversation.id, {
            fastMode: fastAsked(
              argument,
              isFastModeChecked(conversation.fastMode, conversation.fastReport),
            ),
          }),
      }),
  }
}
