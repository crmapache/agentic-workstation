import { basename } from 'node:path'

import type { ProviderId } from '@shared/providers'
import { PROVIDER_IDS } from '@shared/providers'
import type { TaskRun } from '@shared/tasks'

import type { AgentCaller, AgentOrigin } from '../inbox/inbox-agent'
import type { ChatOrigin } from '../inbox/inbox-service'
import type { ScenarioProvider } from '../providers/scenario-provider'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { PanelRegistry } from '../agents/panel/panel-registry'

/** Что разговорам заданий и уведомлений нужно от IDE: панели и исполнители провайдеров. */
export type TaskChatsHost = {
  panels: PanelRegistry
  provider: (id: ProviderId) => ScenarioProvider | null
  workspace: WorkspaceService
  /** Прогон задания по разговору, приславшему уведомление (его сессия движка). */
  runBySession: (sessionId: string) => TaskRun | null
}

/**
 * Разговоры прогонов заданий и уведомлений во вкладках панели любого провайдера
 * (docs/plan-providers/50-ide.md): открыть прогон чатом, отправить слова во вкладку, найти,
 * чей разговор прислал уведомление. Разговор прогона у провайдера назван своим id (поток
 * Codex, сессия OpenCode) - его даёт исполнитель провайдера.
 */
export const taskChats = (host: TaskChatsHost) => {
  const { panels, workspace } = host

  /** Вкладка разговора провайдера по id вкладки или id разговора; нет - undefined. */
  const tabOf = (provider: ProviderId, conversationId: string, sessionId: string) =>
    panels
      .find(provider)
      ?.getState()
      .conversations.find(
        (one) => one.id === conversationId || (sessionId !== '' && one.sessionId === sessionId),
      )?.id

  /** Слова - во вкладку разговора; вкладку закрыли - разговор поднимается из истории. */
  const sendTo = async (
    provider: ProviderId,
    projectPath: string,
    origin: { conversationId: string; sessionId: string },
    text: string,
  ): Promise<boolean> => {
    const panel = panels.find(provider)
    const find = () => tabOf(provider, origin.conversationId, origin.sessionId)
    let id = find()

    if (!panel) return false
    if (!id && origin.sessionId) {
      id = await panel.openHistory(projectPath, origin.sessionId).then(find, () => undefined)
    }
    if (!id) return false

    await panel.actions.send(id, { text, images: [] })

    return true
  }

  return {
    /** Разговор прогона - вкладкой панели его провайдера. */
    openChat: async (run: Pick<TaskRun, 'projectPath' | 'sessionId' | 'provider'>) => {
      const runner = host.provider(run.provider)
      const chatId = await runner?.chatIdOf(run.sessionId)
      const panel = panels.find(run.provider)

      if (!chatId || !panel) return false

      // Указания прогона задания живут в разговоре Codex и OpenCode: чатом - уже без них.
      await runner?.releaseChat?.(chatId)

      try {
        await workspace.openProject(run.projectPath)
        await panel.openHistory(run.projectPath, chatId)

        return true
      } catch {
        return false
      }
    },

    /** Прогон уже открыт вкладкой - слова туда, а не вторым процессом; false - вкладки нет. */
    sendToRunChat: async (run: Pick<TaskRun, 'sessionId' | 'provider'>, text: string) => {
      const chatId = await host.provider(run.provider)?.chatIdOf(run.sessionId)
      const id = chatId ? tabOf(run.provider, '', chatId) : undefined
      const panel = panels.find(run.provider)

      if (!id || !panel) return false

      await panel.actions.send(id, { text, images: [] })

      return true
    },

    /** Нажатие кнопки уведомления - словами в разговор, который его прислал. */
    sendToOrigin: (origin: ChatOrigin, projectPath: string, text: string) =>
      sendTo(origin.provider, projectPath, origin, text),

    /** Чей разговор прислал уведомление: прогон задания, вкладка панели любого провайдера. */
    originOf: ({ projectPath, conversationId }: AgentCaller): AgentOrigin => {
      const run = conversationId ? host.runBySession(conversationId) : null

      if (run) {
        return { origin: { kind: 'task', taskId: run.taskId, runId: run.id }, source: run.taskName }
      }

      for (const provider of PROVIDER_IDS) {
        const chat = panels
          .find(provider)
          ?.getState()
          .conversations.find((one) => one.id === conversationId)

        if (chat) {
          return {
            origin: { kind: 'chat', provider, conversationId: chat.id, sessionId: chat.sessionId },
            source: chat.title || basename(projectPath),
          }
        }
      }

      return { origin: { kind: 'none' }, source: basename(projectPath) }
    },

    /** Довериться папке прогона - у провайдера этого прогона. */
    trust: (projectPath: string, run: Pick<TaskRun, 'provider'> | null) =>
      panels.find(run?.provider ?? 'claude')?.trustProject(projectPath) ?? Promise.resolve(null),
  }
}
