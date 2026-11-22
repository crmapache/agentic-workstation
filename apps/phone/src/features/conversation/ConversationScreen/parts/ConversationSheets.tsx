import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import type { useConversationSheets, useConversationCommands } from '../ConversationScreen.hooks'
import { AsideSheet } from '../../AsideSheet/AsideSheet'
import { ConversationSettings } from '../../ConversationSettings/ConversationSettings'
import { RewindSheet } from '../../RewindSheet/RewindSheet'
import type { Capsule } from '../../TaskCapsules/TaskCapsules.types'
import { CapsuleSheet } from '../../TaskCapsules/parts/CapsuleSheet'
import type { RouteOf } from '../../../../lib/route.types'

/**
 * Всё, что открывается поверх разговора: настройки, вопросы сбоку, откат к сообщению и лист
 * задачи из капсулы. Откат собирается заново для каждого сообщения: его выбор и предпросмотр -
 * про одно сообщение. Вопросы сбоку - только открытыми: их вопросы и ответы живут в сторе, а
 * закрытое окно с полем держало бы в странице лишний textarea. Лист задачи - по живой капсуле:
 * задача кончилась, капсулы нет - и листа нет.
 */
export const ConversationSheets = ({
  route,
  conversation,
  provider,
  sheets,
  commands,
  capsules,
  offset,
}: {
  route: RouteOf<'conversation'>
  conversation: ConversationWire
  provider: ProviderCaps | undefined
  sheets: ReturnType<typeof useConversationSheets>
  commands: ReturnType<typeof useConversationCommands>
  capsules: Capsule[]
  /** Насколько часы IDE впереди часов телефона. */
  offset: number
}) => {
  const { agentId, conversationId } = route
  const capsule = capsules.find((one) => one.id === sheets.openCapsule) ?? null

  const handleStopTask = (stopped: Capsule) => {
    if (stopped.stop) commands.handleStopTask(stopped.stop.taskId)
  }

  return (
    <>
      {provider && (
        <ConversationSettings
          open={sheets.isSettingsOpen}
          agentId={agentId}
          conversation={conversation}
          provider={provider}
          onClose={() => sheets.setIsSettingsOpen(false)}
        />
      )}
      {sheets.isAsideOpen && (
        <AsideSheet
          open
          agentId={agentId}
          conversationId={conversationId}
          onClose={() => sheets.setIsAsideOpen(false)}
        />
      )}
      {sheets.rewindTo && (
        <RewindSheet
          key={sheets.rewindTo}
          agentId={agentId}
          conversationId={conversationId}
          messageId={sheets.rewindTo}
          draftKey={`${agentId}|${conversationId}`}
          running={conversation.status !== 'idle'}
          queued={conversation.queue.length}
          allowedScopes={provider?.rewindScopes}
          onClose={() => sheets.setRewindTo(null)}
        />
      )}
      {capsule && (
        <CapsuleSheet
          key={capsule.id}
          capsule={capsule}
          offset={offset}
          onStop={sheets.canStopTask ? handleStopTask : null}
          onClose={() => sheets.setOpenCapsule(null)}
        />
      )}
    </>
  )
}
