import { useTranslation } from 'react-i18next'

import type { ActivityCall } from '../ActivityBar/ActivityBar.types'
import type { ProviderViewId } from '../../state/layout.types'
import { useActiveProject } from '../../state/workspace.queries'
import { useAllConversations } from '../../features/agent-panel/panel.queries'
import { useTabCallsStore } from '../../features/agent-panel/tab-calls.store'
import { tabName } from '../../features/agent-panel/ConversationTabs/ConversationTabs.utils'
import { providerCalls } from './provider-calls.utils'
import { PROVIDER_VIEWS } from './provider-views'
import { viewLabel } from './view-label'

/**
 * Свет на иконках провайдеров (зона 3): разговор открытого проекта позвал человека (закончил
 * ход, спросил, упал) - его панель горит тем же светом, что вкладка дома или разговора. Источник
 * один со светом вкладки: открыли разговор - гаснут оба. Работа в другом провайдере так не
 * проходит мимо: панель на экране одна. Горит, только пока панели не видно (ActivityBar).
 */
export const useProviderCalls = (): Partial<Record<ProviderViewId, ActivityCall>> => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const calls = useTabCallsStore((store) => store.calls)
  const conversations = useAllConversations()

  if (!project) return {}

  const byView = providerCalls(conversations, calls, project.rootPath, (id, call) => {
    const conversation = conversations.find((item) => item.id === id)

    return t('projects.call', {
      chat: conversation ? tabName(conversation, t) : '',
      reason: t(`settings.sounds.events.${call.reason}.label`),
    })
  })

  return Object.fromEntries(
    PROVIDER_VIEWS.flatMap((view) => {
      const call = byView[view.id]

      return call
        ? [
            [
              view.id,
              {
                tone: call.tone,
                at: call.at,
                label: [viewLabel(view, t), ...call.lines].join('\n'),
              },
            ],
          ]
        : []
    }),
  )
}
