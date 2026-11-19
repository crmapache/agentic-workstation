import { useState } from 'react'

import type { Conversation } from '@shared/conversation'
import type { RewindScope } from '@shared/rewind'

import { useConversationActions } from '../conversation-actions.hooks'
import { applyDraft } from '../field-bus'
import { useReuseDraft } from '../message.hooks'
import { messageDraft, answersBefore, messageClipboard } from '../message.utils'
import { useRewindPreview, useConversationFeed } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import type { RewindTarget } from '../panel.types'
import { usePinsStore } from '../pins.store'
import type { ShownRefusal } from './RewindDialog.types'
import { forkBlocked, subjectLine, forkTakesCode } from './RewindDialog.utils'

/**
 * Диалог отката: что тронет код (спрашивается у CLI при открытии), выбор, нажатие и
 * отказ. Успех возвращает сообщение в поле кусками (чипы, картинки), снимает закрепы с
 * ушедшего и закрывает диалог; разговор откатился, а код нет - диалог остаётся сказать
 * это. «In a new tab» - тот же разрез в форке, код (при «Both») - здесь же, до форка.
 */
export const useRewindDialog = (target: RewindTarget, conversation: Conversation) => {
  const { conversationId, messageId } = target
  const { rewind, fork } = useConversationActions()
  const closeRewind = usePanelStore((store) => store.closeRewind)
  const unpin = usePinsStore((store) => store.unpin)
  const reuseDraft = useReuseDraft()
  const { data: feed } = useConversationFeed(conversationId)
  const preview = useRewindPreview(conversationId, messageId)
  const [choice, setChoice] = useState<RewindScope>('conversation')
  const [isWorking, setIsWorking] = useState(false)
  const [refusal, setRefusal] = useState<ShownRefusal | null>(null)
  const [filesFailed, setFilesFailed] = useState<string | null>(null)
  const items = feed?.items ?? []
  const at = items.findIndex((item) => item.id === messageId)
  const found = items[at]
  const item = found?.kind === 'user' ? found : null
  const draft = item ? messageDraft(item, answersBefore(items, item.id)) : null
  const code = preview.data
  const isRunning = conversation.status !== 'idle'
  const isBlocked = choice === 'code' && isRunning
  const isForkHeld = forkBlocked(choice, code, isRunning)

  /** Сообщение для поля - собирается до отката: после него сообщения в ленте нет. */
  const prepareDraft = () => (item && draft ? reuseDraft(conversationId, item, draft) : null)

  const submit = async () => {
    if (isWorking || isBlocked) return

    setIsWorking(true)
    setRefusal(null)

    const reused = choice === 'code' ? null : await prepareDraft()
    const outcome = await rewind(conversationId, messageId, choice)

    setIsWorking(false)

    if (!outcome) return setRefusal({ reason: null, detail: '' })
    if (!outcome.rewound) return setRefusal(outcome)

    if (choice !== 'code') {
      const prefill = outcome.prefill.trim()

      unpin(
        conversationId,
        items.slice(Math.max(at, 0)).map((entry) => entry.id),
      )

      if (reused) applyDraft(conversationId, reused)
      else if (prefill)
        applyDraft(conversationId, { tokens: [{ kind: 'text', value: prefill }], quotes: [] })
    }

    if (outcome.filesFailed === null) closeRewind()
    else setFilesFailed(outcome.filesFailed)
  }

  const forkInstead = async () => {
    if (isWorking || isForkHeld) return

    setIsWorking(true)
    setRefusal(null)

    const reused = await prepareDraft()
    const restored = forkTakesCode(choice, code)
      ? await rewind(conversationId, messageId, 'code')
      : null

    if (restored && !restored.rewound) {
      setIsWorking(false)

      return setRefusal(restored)
    }

    const forked = await fork(conversationId, messageId, reused)

    setIsWorking(false)

    if (forked) closeRewind()
    else setRefusal({ reason: null, detail: '' })
  }

  return {
    subject: draft ? subjectLine(messageClipboard(draft)) : '',
    code,
    choice,
    setChoice: (scope: RewindScope) => !isWorking && setChoice(scope),
    queued: conversation.queue.length,
    isRunning,
    isBlocked,
    isForkHeld,
    isWorking,
    refusal,
    filesFailed,
    submit,
    forkInstead,
    close: closeRewind,
  }
}
