import type { Conversation } from '@shared/conversation'

import type { CallLightTone } from '@agentic-workstation/ui/CallLight.types'

import { PROVIDER_VIEW_OF } from '../../state/layout.constants'
import type { ProviderViewId } from '../../state/layout.types'
import type { TabCall } from '../../features/agent-panel/panel.types'

/** Зов панели провайдера: повод последнего зова (его цвет), когда, и строки позвавших. */
export type ViewCall = { tone: CallLightTone; at: number; lines: string[] }

/**
 * Зов по панелям провайдеров открытого проекта: у панели, где разговоры позвали человека, -
 * повод последнего зова и строки позвавших от старого к новому. Чужой проект сюда не зовёт:
 * его зов - точками на его вкладке. Разговор, которого уже нет в состоянии, не зовёт.
 */
export const providerCalls = (
  conversations: readonly Pick<Conversation, 'id' | 'projectPath'>[],
  calls: Readonly<Record<string, TabCall>>,
  rootPath: string,
  line: (conversationId: string, call: TabCall) => string,
): Partial<Record<ProviderViewId, ViewCall>> => {
  const mine = conversations
    .flatMap((conversation) => {
      const call = conversation.projectPath === rootPath ? calls[conversation.id] : undefined

      return call ? [{ id: conversation.id, call }] : []
    })
    .sort((a, b) => a.call.at - b.call.at)
  const byView: Partial<Record<ProviderViewId, ViewCall>> = {}

  for (const { id, call } of mine) {
    const view = PROVIDER_VIEW_OF[call.provider]

    byView[view] = {
      tone: call.tone,
      at: call.at,
      lines: [...(byView[view]?.lines ?? []), line(id, call)],
    }
  }

  return byView
}
