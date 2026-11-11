import { useState } from 'react'
import { MessageSquareOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { ConversationSettings } from '../ConversationSettings/ConversationSettings'
import { Feed } from '../Feed/Feed'
import type { RouteOf } from '../../../lib/route.types'
import { Banner } from '../../../shell/Banner/Banner'
import { Screen } from '../../../shell/Screen/Screen'
import { useWorkingText, useConversationScreen } from './ConversationScreen.hooks'
import { modelLabelOf } from './ConversationScreen.utils'
import { ConversationFooter } from './parts/ConversationFooter'
import { ConversationSubtitle } from './parts/ConversationSubtitle'
import { HeaderActions } from './parts/HeaderActions'

/**
 * Разговор с провайдером (сейчас Claude Code): лента, вопрос хода над полем, поле с фото. Пока
 * ход идёт, новое сообщение встаёт в очередь IDE; остановить ход - кнопкой в шапке. Модель,
 * усилие и имя - в настройках разговора.
 */
export const ConversationScreen = ({ route }: { route: RouteOf<'conversation'> }) => {
  const { t } = useTranslation()
  const screen = useConversationScreen(route)
  const { conversation, feed, inventory, link } = screen
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const working = useWorkingText(conversation, inventory)
  const provider = inventory?.providers.find((one) => one.id === conversation?.provider)
  const help = { title: t('conversation.help.title'), text: t('conversation.help.text') }

  if (conversation === null) {
    return (
      <Screen title={t('conversation.title')} help={help}>
        <EmptyState
          icon={MessageSquareOff}
          title={t('conversation.gone.title')}
          description={t('conversation.gone.description')}
        />
      </Screen>
    )
  }

  const banner =
    link === 'offline' || link === 'revoked' ? (
      <Banner tone="warning" text={t(`conversation.link.${link}`)} />
    ) : conversation?.error ? (
      <Banner
        tone="danger"
        text={t(`conversation.errors.${conversation.error}`, {
          defaultValue: t('conversation.errors.other', { code: conversation.error }),
        })}
      />
    ) : undefined

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
      actions={
        conversation && (
          <HeaderActions
            running={conversation.status === 'running'}
            stopping={screen.isStopping}
            onStop={screen.handleStop}
            onSettings={() => setIsSettingsOpen(true)}
          />
        )
      }
      help={help}
      banner={banner}
      bodyRef={screen.bodyRef}
      footer={
        <ConversationFooter
          conversation={conversation}
          draftKey={`${route.agentId}|${route.conversationId}`}
          deciding={screen.isDeciding}
          onDecide={screen.handleDecide}
          onSend={screen.handleSend}
        />
      }>
      <Feed view={feed} working={working} />
      {conversation && provider && (
        <ConversationSettings
          open={isSettingsOpen}
          agentId={route.agentId}
          conversation={conversation}
          provider={provider}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </Screen>
  )
}
