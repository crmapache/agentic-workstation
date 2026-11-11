import { useRef, useEffect, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'

import { STICK_THRESHOLD_PX } from '../Feed/Feed.constants'
import type { Decision } from '../PendingCard/PendingCard.types'
import type { PreparedImage } from '../../../lib/images'
import { useNow } from '../../../lib/now.hooks'
import type { RouteOf } from '../../../lib/route.types'
import { durationText } from '../../../lib/time.utils'
import { useCommand } from '../../../state/commands.hooks'
import {
  useFeed,
  useWatch,
  useInventory,
  useLinkStatus,
  useConversation,
} from '../../../state/remote.queries'
import type { MirroredInventory } from '../../../state/remote.types'

/**
 * Разговор: подписка у IDE (состояние и лента), команды хода и прилипание ленты к низу - пока
 * человек сам не пролистал вверх.
 */
export const useConversationScreen = (route: RouteOf<'conversation'>) => {
  const { agentId, conversationId } = route
  const conversation = useConversation(agentId, conversationId).data
  const feed = useFeed(agentId, conversationId).data
  const inventory = useInventory(agentId).data
  const link = useLinkStatus(agentId)
  const send = useCommand(agentId, 'conversation.send')
  const respond = useCommand(agentId, 'conversation.respond')
  const interrupt = useCommand(agentId, 'conversation.interrupt')
  const bodyRef = useRef<HTMLDivElement>(null)
  const isStuck = useRef(true)

  useWatch(agentId, { kind: 'conversation', conversationId })

  useEffect(() => {
    const body = bodyRef.current

    if (!body) return

    const handleScroll = () => {
      isStuck.current = body.scrollHeight - body.scrollTop - body.clientHeight < STICK_THRESHOLD_PX
    }

    body.addEventListener('scroll', handleScroll, { passive: true })

    return () => body.removeEventListener('scroll', handleScroll)
  }, [])

  useLayoutEffect(() => {
    const body = bodyRef.current

    if (body && isStuck.current) body.scrollTop = body.scrollHeight
  }, [feed, conversation?.status, conversation?.pending])

  const handleSend = async (text: string, images: PreparedImage[]): Promise<boolean> => {
    try {
      await send.mutateAsync({
        conversationId,
        text,
        ...(images.length > 0 && {
          images: images.map(({ mediaType, data }) => ({ mediaType, data })),
        }),
      })
      isStuck.current = true

      return true
    } catch {
      return false
    }
  }

  const handleDecide = (requestId: string, decision: Decision) =>
    respond.mutate({ conversationId, requestId, decision })

  const handleStop = () => interrupt.mutate({ conversationId })

  return {
    conversation,
    feed,
    inventory,
    link,
    bodyRef,
    isDeciding: respond.isPending,
    isStopping: interrupt.isPending,
    handleSend,
    handleDecide,
    handleStop,
  }
}

/** «Working · 1m 20s» внизу ленты, пока идёт ход; часы - IDE, с поправкой на часы телефона. */
export const useWorkingText = (
  conversation: ConversationWire | null | undefined,
  inventory: MirroredInventory | undefined,
): string | null => {
  const { t } = useTranslation()
  const running = conversation?.status === 'running'
  const now = useNow(running ? 1000 : 60_000)
  const started = conversation?.workStartedAt ?? conversation?.turnStartedAt ?? null

  if (!running || started === null) return null

  const offset = inventory ? inventory.at - inventory.receivedAt : 0
  const elapsed = now + offset - started - (conversation?.workPausedMs ?? 0)

  return t('conversation.working', { time: durationText(t, elapsed) })
}
