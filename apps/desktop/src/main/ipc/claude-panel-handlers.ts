import { PANEL_TERMINAL_COMMANDS } from '@shared/panel-extras'
import type { ClaudePanelInvokeContract } from '@shared/ipc/claude-panel.contract'

import type { ClaudeService } from '../claude/claude-service'
import { ASIDE_TEXT_LIMIT } from '../claude/panel/panel.constants'
import type { InvokeHandlers } from './handle'
import { assertOneOf, assertString } from './validate'

type PanelChannels = keyof ClaudePanelInvokeContract

/** Длинный путь - не путь: окно присылает то, что набрано в поле. */
const MAX_PATH_CHARS = 1024

const idOf = (value: unknown, name: string): string => {
  assertString(value, name)

  return value
}

/**
 * Каналы служебных возможностей панели (main/claude/panel): вопрос сбоку, продолжение
 * работы, вход в Claude Design, проверка входа, путь к CLI. Данные окна
 * проверяются здесь, остальное - PanelDesk.
 */
export const createClaudePanelHandlers = (
  claude: ClaudeService,
): Pick<InvokeHandlers, PanelChannels> => {
  const { panel } = claude
  /** Вкладка, которая есть: чужой id - ошибка, а не тихая новая цепочка. */
  const conversation = (value: unknown) => claude.runtime(idOf(value, 'conversationId')).meta.id

  return {
    'claudePanel:getAside': ({ conversationId }) =>
      panel.aside.thread(conversation(conversationId)),
    'claudePanel:askAside': ({ conversationId, question, replaces }) => {
      assertString(question, 'question')

      if (question.length > ASIDE_TEXT_LIMIT) throw new Error('Слишком длинный вопрос')

      return panel.aside.ask(
        conversation(conversationId),
        question,
        replaces === null ? null : idOf(replaces, 'replaces'),
      )
    },
    'claudePanel:cancelAside': ({ conversationId, askId }) =>
      panel.aside.cancel(conversation(conversationId), idOf(askId, 'askId')),
    'claudePanel:showAside': ({ conversationId, open }) =>
      panel.aside.show(conversation(conversationId), open === true),
    'claudePanel:cancelCarryOn': ({ conversationId }) => {
      panel.carryOn.cancel(conversation(conversationId))

      return claude.getState()
    },
    'claudePanel:terminalCommand': ({ command }) =>
      panel.terminalCommand(assertOneOf(command, PANEL_TERMINAL_COMMANDS, 'command')),
    'claudePanel:cliSearch': () => claude.cli.search,
    'claudePanel:setCliPath': ({ path }) => {
      assertString(path, 'path')

      if (path.length > MAX_PATH_CHARS) throw new Error('Слишком длинный путь')

      return panel.setCliPath(path)
    },
  }
}
