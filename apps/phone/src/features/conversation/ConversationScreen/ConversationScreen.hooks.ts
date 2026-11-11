import { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'

import { STICK_THRESHOLD_PX } from '../Feed/Feed.constants'
import type { FeedActions, RunningTask } from '../Feed/Feed.types'
import type { Decision } from '../PendingCard/PendingCard.types'
import type { PreparedImage } from '../../../lib/images'
import { useNow } from '../../../lib/now.hooks'
import type { RouteOf } from '../../../lib/route.types'
import { durationText } from '../../../lib/time.utils'
import { useCommand } from '../../../state/commands.hooks'
import { useLoadEarlier } from '../../../state/feed.hooks'
import { useFeed, useWatch, useInventory, useConversation } from '../../../state/remote.queries'
import type { MirroredInventory } from '../../../state/remote.types'

/**
 * Разговор: подписка у IDE (состояние и лента), команды хода, ранние сообщения по просьбе и
 * прилипание ленты к низу - пока человек сам не пролистал вверх. Страница выше встаёт над лентой,
 * а то, что человек читал, остаётся на месте: в iOS Safari якоря прокрутки нет, место держит
 * расстояние до низа. Пока ход идёт (или ждёт ответа), сообщение встаёт в очередь IDE, как Enter
 * в панели: уйдёт по концу хода, а «Send now» отдаст его модели сразу.
 */
export const useConversationScreen = (route: RouteOf<'conversation'>) => {
  const { agentId, conversationId } = route
  const conversation = useConversation(agentId, conversationId).data
  const feed = useFeed(agentId, conversationId).data
  const inventory = useInventory(agentId).data
  const earlier = useLoadEarlier(agentId, conversationId)
  const send = useCommand(agentId, 'conversation.send')
  const enqueue = useCommand(agentId, 'conversation.enqueue')
  const respond = useCommand(agentId, 'conversation.respond')
  const interrupt = useCommand(agentId, 'conversation.interrupt')
  const bodyRef = useRef<HTMLDivElement>(null)
  const isStuck = useRef(true)
  /**
   * Место перед страницей выше: расстояние до низа ленты и её первый элемент. Встала страница
   * (первый элемент другой) - то же расстояние до низа; заплатка внизу место не трогает.
   */
  const held = useRef<{ fromBottom: number; firstId: string } | null>(null)

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

    if (!body) return

    const place = held.current

    if (place && feed?.items[0]?.id !== place.firstId) {
      body.scrollTop = body.scrollHeight - place.fromBottom
      held.current = null
    } else if (isStuck.current) {
      body.scrollTop = body.scrollHeight
    }
  }, [feed, conversation?.status, conversation?.pending])

  const handleSend = async (text: string, images: PreparedImage[]): Promise<boolean> => {
    const args = {
      conversationId,
      text,
      ...(images.length > 0 && {
        images: images.map(({ mediaType, data }) => ({ mediaType, data })),
      }),
    }

    // Пока идёт ход - в очередь IDE, она уйдёт после него. Пока висит вопрос - сразу, как Send
    // окна: IDE кладёт слова человека перед отказом, и модель их прочтёт, а не будет ждать.
    try {
      await (conversation?.status === 'running' ? enqueue : send).mutateAsync(args)
      isStuck.current = true

      return true
    } catch {
      return false
    }
  }

  const handleDecide = (requestId: string, decision: Decision) =>
    respond.mutate({ conversationId, requestId, decision })

  const handleStop = () => interrupt.mutate({ conversationId })

  const handleLoadEarlier = () => {
    const body = bodyRef.current

    if (earlier.isPending) return
    if (body) {
      held.current = {
        fromBottom: body.scrollHeight - body.scrollTop,
        firstId: feed?.items[0]?.id ?? '',
      }
    }

    earlier.mutate(undefined, {
      // Страница не пришла или не встала (ленту сменил снимок) - держать место нечему.
      onSettled: (prepended) => {
        if (!prepended) held.current = null
      },
    })
  }

  return {
    conversation,
    feed,
    inventory,
    bodyRef,
    isDeciding: respond.isPending,
    isStopping: interrupt.isPending,
    isLoadingEarlier: earlier.isPending,
    handleSend,
    handleDecide,
    handleStop,
    handleLoadEarlier,
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

/**
 * Команды разговора, у которых нет своего экрана: очередь (сейчас, переставить, убрать), «Don't
 * continue», погасить процесс, закрыть вопрос, остановить задачу. Новое состояние приходит
 * зеркалом.
 */
export const useConversationCommands = (agentId: string, conversationId: string) => {
  const sendQueued = useCommand(agentId, 'conversation.sendQueued')
  const moveQueued = useCommand(agentId, 'conversation.moveQueued')
  const unqueue = useCommand(agentId, 'conversation.unqueue')
  const cancelCarryOn = useCommand(agentId, 'conversation.cancelCarryOn')
  const forceStop = useCommand(agentId, 'conversation.forceStop')
  const dismiss = useCommand(agentId, 'conversation.dismiss')
  const stopTask = useCommand(agentId, 'conversation.stopTask')

  return {
    isQueueBusy: sendQueued.isPending || moveQueued.isPending || unqueue.isPending,
    isCancellingCarryOn: cancelCarryOn.isPending,
    isForceStopping: forceStop.isPending,
    isDismissing: dismiss.isPending,
    handleSendQueued: (queuedId: string) => sendQueued.mutate({ conversationId, queuedId }),
    handleMoveQueued: (queuedId: string, toIndex: number) =>
      moveQueued.mutate({ conversationId, queuedId, toIndex }),
    handleUnqueue: (queuedId: string) => unqueue.mutate({ conversationId, queuedId }),
    handleCancelCarryOn: () => cancelCarryOn.mutate({ conversationId }),
    handleForceStop: () => forceStop.mutate({ conversationId }),
    handleDismiss: (requestId: string) => dismiss.mutate({ conversationId, requestId }),
    handleStopTask: (taskId: string) => stopTask.mutate({ conversationId, taskId }),
  }
}

/**
 * Что открыто поверх разговора: настройки, вопросы сбоку, откат к сообщению, «остановить
 * задачу?». Действия ленты - стабильной ссылкой: строки ленты - memo.
 */
export const useConversationSheets = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAsideOpen, setIsAsideOpen] = useState(false)
  const [rewindTo, setRewindTo] = useState<string | null>(null)
  const [stoppingTask, setStoppingTask] = useState<RunningTask | null>(null)
  const feedActions = useMemo<FeedActions>(
    () => ({ onStopTask: setStoppingTask, onRewind: setRewindTo }),
    [],
  )

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    isAsideOpen,
    setIsAsideOpen,
    rewindTo,
    setRewindTo,
    stoppingTask,
    setStoppingTask,
    feedActions,
  }
}
