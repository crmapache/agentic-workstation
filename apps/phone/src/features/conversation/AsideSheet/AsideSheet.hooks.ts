import { useState } from 'react'

import type { AsideAnswerWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import { NO_ASKS, useAsideStore } from '../aside.store'
import { useClient } from '../../../lib/client'
import { newId } from '../../../lib/ids'
import { CommandError } from '../../../state/command-error'
import { useCommand } from '../../../state/commands.hooks'

/**
 * Спросить сбоку - из окна вопросов и из поля сообщения (/btw вопрос). Вопрос встаёт в список
 * сразу, ответ ложится в него, когда пришёл. false - не спрошено: пусто или модель ещё думает над
 * прошлым (CLI держит один вопрос сбоку за раз).
 */
export const useAskAside = (agentId: string, conversationId: string) => {
  const client = useClient()
  const key = `${agentId}|${conversationId}`
  const entries = useAsideStore((state) => state.asks[key] ?? NO_ASKS)
  const add = useAsideStore((state) => state.add)
  const settle = useAsideStore((state) => state.settle)
  const isThinking = entries.some((entry) => !entry.answer && !entry.error)

  const ask = (question: string): boolean => {
    const text = question.trim()

    if (!text || isThinking) return false

    const askId = newId()

    add(key, { askId, question: text, askedAt: Date.now(), answer: null, error: null })
    void client
      .command(agentId, 'conversation.aside', { conversationId, askId, question: text })
      .then((outcome) =>
        settle(
          key,
          askId,
          outcome.ok
            ? { answer: outcome.data as AsideAnswerWire, error: null }
            : { answer: null, error: new CommandError(outcome) },
        ),
      )

    return true
  }

  return { entries, isThinking, ask }
}

/**
 * Вопрос сбоку (/btw): модель отвечает по разговору, не останавливая работу и без записи в
 * транскрипт. Ответ идёт до одиннадцати минут - команда ждёт его сама (COMMAND_PATIENCE_MS), а
 * окно можно закрыть: ответ ляжет в список, пока страница жива. Отказ - в карточке вопроса, а не
 * общим уведомлением.
 */
export const useAside = (agentId: string, conversationId: string) => {
  const { entries, isThinking, ask } = useAskAside(agentId, conversationId)
  const cancel = useCommand(agentId, 'conversation.asideCancel')
  const [question, setQuestion] = useState('')

  const handleAsk = () => {
    if (ask(question)) setQuestion('')
  }

  const handleCancel = (askId: string) => cancel.mutate({ conversationId, askId })

  return {
    entries,
    question,
    setQuestion,
    isThinking,
    isCancelling: cancel.isPending,
    handleAsk,
    handleCancel,
  }
}
