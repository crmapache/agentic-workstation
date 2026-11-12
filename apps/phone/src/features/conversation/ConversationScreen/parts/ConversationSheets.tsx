import { useTranslation } from 'react-i18next'

import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import type { useConversationSheets, useConversationCommands } from '../ConversationScreen.hooks'
import { AsideSheet } from '../../AsideSheet/AsideSheet'
import { ConversationSettings } from '../../ConversationSettings/ConversationSettings'
import { RewindSheet } from '../../RewindSheet/RewindSheet'
import type { RouteOf } from '../../../../lib/route.types'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'

/**
 * Всё, что открывается поверх разговора: настройки, вопросы сбоку, откат к сообщению и
 * «остановить задачу?». Откат собирается заново для каждого сообщения: его выбор и
 * предпросмотр - про одно сообщение. Вопросы сбоку - только открытыми: их вопросы и ответы
 * живут в сторе, а закрытое окно с полем держало бы в странице лишний textarea.
 */
export const ConversationSheets = ({
  route,
  conversation,
  provider,
  sheets,
  commands,
}: {
  route: RouteOf<'conversation'>
  conversation: ConversationWire
  provider: ProviderCaps | undefined
  sheets: ReturnType<typeof useConversationSheets>
  commands: ReturnType<typeof useConversationCommands>
}) => {
  const { t } = useTranslation()
  const { agentId, conversationId } = route
  const task = sheets.stoppingTask

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
          onClose={() => sheets.setRewindTo(null)}
        />
      )}
      <ConfirmDialog
        open={task !== null}
        title={t(`feed.stopTaskConfirm.${task?.kind ?? 'agent'}`, {
          defaultValue: t('feed.stopTaskConfirm.agent'),
        })}
        confirmLabel={t('conversation.stop')}
        onConfirm={() => task && commands.handleStopTask(task.taskId)}
        onClose={() => sheets.setStoppingTask(null)}
      />
    </>
  )
}
