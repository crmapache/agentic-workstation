import type { BrowserWindow } from 'electron'

import { PROVIDER_IDS } from '@shared/providers'

import { broadcast } from '../ipc/broadcast'
import { raiseWindow } from '../window/raise-window'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import type { ComputerRuntime } from './computer-runtime'
import { returnToChat } from './return-to-chat'

/**
 * Computer Use и чаты панелей. Ключ вызова Computer у разговора панели - id его вкладки, у
 * процесса без вкладки (сценарий, задание) - свой, и тогда чата нет.
 *
 * - Stop в капсуле останавливает и ход разговора, который держал компьютер, - как Stop в чате
 *   (ADR 0060). Процесс без вкладки узнаёт об остановке отказом шага.
 * - Работа на компьютере кончилась, а человек его не трогал - IDE выходит вперёд с этим чатом
 *   (ADR 0130).
 * - Показ Walkthrough кончился - по любой причине - IDE выходит вперёд с его чатом (ADR 0135): в
 *   показе человек всё время двигает мышь, так что его ввод возврат не отменяет.
 */
export const wireComputerChats = (
  computer: ComputerRuntime,
  ide: {
    panels: PanelRegistry
    workspace: WorkspaceService
    getWindow: () => BrowserWindow | null
    /** Возврат включён в Settings → Chat - спрашивается в момент возврата. */
    isReturnOn: () => boolean
    /**
     * Идёт показ Walkthrough в этом разговоре (ADR 0134): IDE не выходит вперёд - модель спросила
     * «понятно?», а показываемое приложение должно остаться перед человеком.
     */
    isShowing: (key: string) => boolean
  },
): void => {
  const chatOf = (key: string) => {
    for (const provider of PROVIDER_IDS) {
      const panel = ide.panels.find(provider)
      const conversation = panel?.getState().conversations.find((one) => one.id === key)

      if (panel && conversation) return { provider, panel, conversation }
    }

    return null
  }

  const backToChat = (key: string) => {
    void returnToChat(key, {
      isWanted: ide.isReturnOn,
      find: (id) => {
        const chat = chatOf(id)

        return chat && { provider: chat.provider, projectPath: chat.conversation.projectPath }
      },
      openProject: (path) => ide.workspace.openProject(path),
      activate: (provider, id) => ide.panels.find(provider)?.activateConversation(id),
      showPanel: (provider) => broadcast('computer:returned', { provider }),
      raise: () => raiseWindow(ide.getWindow()),
    }).catch((error: unknown) => console.warn('[computer] cannot return to the chat:', error))
  }

  computer.stopped = (key) => chatOf(key)?.panel.actions.interrupt(key)
  computer.finished = (key) => {
    if (!ide.isShowing(key)) backToChat(key)
  }
  computer.walkthrough.backToChat = backToChat
}
