import { MessagesSquare, MessageSquareOff, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { Feed } from '../Feed/Feed'
import type { RouteOf } from '../../../lib/route.types'
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
 * Разговор с провайдером (сейчас Claude Code): лента с ранними сообщениями по просьбе, решение
 * хода над полем, очередь, поле с фото и Stop идущего хода - всё в низу, под пальцем. Пока ход
 * идёт, новое сообщение встаёт в очередь IDE. Вопрос сбоку и настройки разговора (модель,
 * усилие, имя, быстрый режим) - значками в шапке; откат - у сообщения в ленте.
 */
export const ConversationScreen = ({ route }: { route: RouteOf<'conversation'> }) => {
  const { t } = useTranslation()
  const screen = useConversationScreen(route)
  const commands = useConversationCommands(route.agentId, route.conversationId)
  const sheets = useConversationSheets()
  const { conversation, feed, inventory } = screen
  const working = useWorkingText(conversation, inventory)
  const provider = inventory?.providers.find((one) => one.id === conversation?.provider)
  const offset = inventory ? inventory.at - inventory.receivedAt : 0
  const help = { title: t('conversation.help.title'), text: t('conversation.help.text') }

  if (conversation === null) {
    return (
      <Screen title={t('conversation.title')} agentId={route.agentId} help={help}>
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
            <IconButton
              icon={MessagesSquare}
              size="touch"
              label={t('aside.open')}
              onClick={() => sheets.setIsAsideOpen(true)}
            />
            <IconButton
              icon={SlidersHorizontal}
              size="touch"
              label={t('conversation.settings.title')}
              onClick={() => sheets.setIsSettingsOpen(true)}
            />
          </>
        )
      }
      help={help}
      banner={
        conversation?.error && (
          <Banner
            tone="danger"
            text={t(`conversation.errors.${conversation.error}`, {
              defaultValue: t('conversation.errors.other', { code: conversation.error }),
            })}
          />
        )
      }
      bodyRef={screen.bodyRef}
      footer={
        <ConversationFooter
          conversation={conversation}
          draftKey={`${route.agentId}|${route.conversationId}`}
          offset={offset}
          screen={screen}
          commands={commands}
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
        />
      )}
    </Screen>
  )
}
