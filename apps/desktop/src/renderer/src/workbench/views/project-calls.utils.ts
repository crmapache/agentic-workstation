import type { Conversation } from '@shared/claude'
import type { RunSummary } from '@shared/scenario-runs'
import { isRunAsking } from '@shared/scenario-runs'

import type { TabCall } from '../../features/claude-code/claude.types'
import type { ProjectCall } from '../../features/projects/ProjectTab/ProjectTab.types'

/** Прогон сценария, каким его видит зов: чей, ждёт ли человека и с какого момента. */
export type CallingRun = Pick<
  RunSummary,
  'id' | 'projectPath' | 'state' | 'asking' | 'startedAt' | 'restingSince' | 'scenarioName'
>

/** Слова зова для подсказки вкладки: разговора - по его поводу, прогона - по сценарию. */
export type CallTexts = {
  chat: (conversationId: string, call: TabCall) => string
  run: (run: CallingRun) => string
}

/**
 * Зов одного проекта, от старого к новому: позвавшие разговоры и прогоны сценариев, которые
 * ждут человека. Разговор, которого уже нет в состоянии (закрыли), не зовёт: его свет уходит
 * вместе с вкладкой. Прогон зовёт, пока ждёт, - с того момента, как встал на вопросе.
 */
export const projectCalls = (
  conversations: readonly Pick<Conversation, 'id' | 'projectPath'>[],
  calls: Readonly<Record<string, TabCall>>,
  runs: readonly CallingRun[],
  rootPath: string,
  text: CallTexts,
): ProjectCall[] => {
  const chats = conversations.flatMap((conversation): ProjectCall[] => {
    const call = conversation.projectPath === rootPath ? calls[conversation.id] : undefined

    return call
      ? [
          {
            id: conversation.id,
            tone: call.tone,
            at: call.at,
            text: text.chat(conversation.id, call),
          },
        ]
      : []
  })
  const asking = runs
    .filter((run) => run.projectPath === rootPath && isRunAsking(run))
    .map((run): ProjectCall => ({
      id: run.id,
      tone: 'attention',
      at: run.restingSince || run.startedAt,
      text: text.run(run),
    }))

  return [...chats, ...asking].sort((a, b) => a.at - b.at)
}
