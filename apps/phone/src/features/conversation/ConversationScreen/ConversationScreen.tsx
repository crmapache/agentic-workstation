import { useMemo } from 'react'
import { MessagesSquare, MessageSquareOff, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useConversationSlash } from '../slash.hooks'
import { Feed } from '../Feed/Feed'
import { QuoteButton } from '../QuoteButton/QuoteButton'
import { useQuotableSelection } from '../QuoteButton/QuoteButton.hooks'
import { TaskCapsules } from '../TaskCapsules/TaskCapsules'
import { taskCapsules } from '../TaskCapsules/TaskCapsules.utils'
import { canReadAloud } from '../../read-aloud/read-aloud.utils'
import { useCallOfConversation } from '../../voice-call/voice-call.hooks'
import type { OutgoingMessage } from '../../../lib/attachments'
import type { RouteOf } from '../../../lib/route.types'
import { useDraftsStore } from '../../../state/drafts.store'
import { VoiceCallBar } from '../../voice-call/VoiceCallBar/VoiceCallBar'
import { Banner } from '../../../shell/Banner/Banner'
import { Screen } from '../../../shell/Screen/Screen'
import {
  useWorkingText,
  useConversationScreen,
  useConversationSheets,
  useConversationCommands,
} from './ConversationScreen.hooks'
import { modelLabelOf } from './ConversationScreen.utils'
import { ConversationFooter } from './parts/ConversationFooter'
import { ConversationSheets } from './parts/ConversationSheets'
import { ConversationSubtitle } from './parts/ConversationSubtitle'

/**
 * Разговор с провайдером (Claude Code, Codex, открытые модели): лента с ранними сообщениями по
 * просьбе, решение хода над полем, очередь, поле с фото и Stop идущего хода - всё в низу, под
 * пальцем. Пока ход идёт, новое сообщение встаёт в очередь IDE. Вопрос сбоку и настройки
 * разговора (модель, усилие, имя, быстрый режим) - значками в шапке; идущие агенты и фоновые
 * команды - капсулами под шапкой, как в панели IDE; откат - у сообщения в ленте; выделенное в
 * ответе - цитатой в поле кнопкой над лентой. Чего провайдер не умеет (вопрос сбоку, откат,
 * остановка задачи), того на экране нет.
 */
export const ConversationScreen = ({ route }: { route: RouteOf<'conversation'> }) => {
  const { t } = useTranslation()
  const screen = useConversationScreen(route)
  const commands = useConversationCommands(route.agentId, route.conversationId)
  const { conversation, feed, inventory } = screen
  const provider = inventory?.providers.find((one) => one.id === conversation?.provider)
  const sheets = useConversationSheets(provider, canReadAloud(inventory) ? route : null)
  const working = useWorkingText(conversation, inventory)
  const draftKey = `${route.agentId}|${route.conversationId}`
  const slash = useConversationSlash({
    agentId: route.agentId,
    draftKey,
    conversation,
    provider,
    onOpenAside: () => sheets.setIsAsideOpen(true),
    onOpenSettings: () => sheets.setIsSettingsOpen(true),
  })
  const quotable = useQuotableSelection(screen.bodyRef)
  const addQuote = useDraftsStore((state) => state.addQuote)
  const voiceCall = useCallOfConversation(route.agentId, route.conversationId)
  const capsules = useMemo(() => taskCapsules(feed), [feed])

  const handleQuote = () => {
    const quote = quotable.take()

    if (quote) addQuote(draftKey, quote)
  }

  // Свою команду (/btw, /fast, /model, /effort) выполняет телефон, остальное уходит в разговор.
  const handleSend = (message: OutgoingMessage): Promise<boolean> => {
    const local = slash.run(message)

    return local === null ? screen.handleSend(message) : Promise.resolve(local)
  }
  const offset = inventory ? inventory.at - inventory.receivedAt : 0

  if (conversation === null) {
    return (
      <Screen title={t('conversation.title')} agentId={route.agentId}>
        <EmptyState
          icon={MessageSquareOff}
          title={t('conversation.gone.title')}
          description={t('conversation.gone.description')}
        />
      </Screen>
    )
  }

  return (
    <Screen
      title={conversation?.title ?? t('conversation.title')}
      subtitle={
        conversation && (
          <ConversationSubtitle
            conversation={conversation}
            model={modelLabelOf(conversation, provider)}
          />
        )
      }
      agentId={route.agentId}
      actions={
        conversation && (
          <>
            {provider?.aside !== false && (
              <IconButton
                icon={MessagesSquare}
                size="touch"
                label={t('aside.open')}
                onClick={() => sheets.setIsAsideOpen(true)}
              />
            )}
            <IconButton
              icon={SlidersHorizontal}
              size="touch"
              label={t('conversation.settings.title')}
              onClick={() => sheets.setIsSettingsOpen(true)}
            />
          </>
        )
      }

      banner={
        <>
          {voiceCall && <VoiceCallBar agentId={route.agentId} call={voiceCall} />}
          {conversation?.error && (
            <Banner
              tone="danger"
              text={t(`conversation.errors.${conversation.error}`, {
                defaultValue: t('conversation.errors.other', { code: conversation.error }),
              })}
            />
          )}
          <TaskCapsules
            capsules={capsules}
            offset={offset}
            openId={sheets.openCapsule}
            onOpen={sheets.setOpenCapsule}
          />
        </>
      }
      bodyRef={screen.bodyRef}
      overlay={
        <QuoteButton selection={quotable.shown} onHold={quotable.hold} onQuote={handleQuote} />
      }
      footer={
        <ConversationFooter
          conversation={conversation}
          draftKey={draftKey}
          offset={offset}
          screen={screen}
          commands={commands}
          slash={slash.slash}
          onSend={handleSend}
        />
      }>
      <Feed
        agentId={route.agentId}
        view={feed}
        working={working}
        loadingEarlier={screen.isLoadingEarlier}
        actions={sheets.feedActions}
        onLoadEarlier={screen.handleLoadEarlier}
      />
      {conversation && (
        <ConversationSheets
          route={route}
          conversation={conversation}
          provider={provider}
          sheets={sheets}
          commands={commands}
          capsules={capsules}
          offset={offset}
        />
      )}
    </Screen>
  )
}
