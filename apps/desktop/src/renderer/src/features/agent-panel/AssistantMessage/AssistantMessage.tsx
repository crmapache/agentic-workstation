import { memo, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSmoothText, RevealProvider } from 'smooth-stream-text/react'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useFeedScope } from '../feed-scope.context'
import { usePin } from '../pins.store'
import { RevealContext } from '../reveal.context'
import { FindingsCard } from '../FindingsCard/FindingsCard'
import { readReview } from '../FindingsCard/FindingsCard.utils'
import { Markdown } from '../Markdown/Markdown'
import { clipboardText } from '../Markdown/Markdown.utils'
import { MessageMenu } from '../MessageMenu/MessageMenu'
import { PinButton } from '../PinButton/PinButton'
import { PinItem } from '../PinItem/PinItem'
import { ReadAloudButton } from '../ReadAloudButton/ReadAloudButton'
import { useReadAloudPhase, useReadAloudAvailable } from '../ReadAloudButton/ReadAloudButton.hooks'
import { ReadAloudItem } from '../ReadAloudItem/ReadAloudItem'
import { REVEAL_LIMIT } from './AssistantMessage.constants'
import { useRevealOptions } from './AssistantMessage.hooks'
import styles from './AssistantMessage.module.scss'
import type { AssistantMessageProps } from './AssistantMessage.types'

/**
 * Ответ модели - карточка с рамкой (как в ACC): видно, где кончились шаги и начался
 * ответ. В углу - три точки: копия всего ответа, «прочитать вслух» (ADR 0106) и булавка
 * (ADR 0122). Снаружи горит только идущее: булавка закреплённого и «стоп» читаемого вслух.
 * Копия блока кода - в углу самого блока (CodeBlock). CLI шлёт текст рывками -
 * smooth-stream-text выравнивает темп, а символы проступают волной; готовый ответ
 * (история, транскрипт) и очень длинный встают сразу.
 */
export const AssistantMessage = memo(({ item }: AssistantMessageProps) => {
  const { t } = useTranslation()
  const { conversationId, readOnly } = useFeedScope()
  const { isPinned } = usePin(conversationId, item.id)
  // Пока ответ пишется, читать нечего: текст ещё не тот, что останется.
  const canRead = useReadAloudAvailable() && !item.streaming
  const isReading = useReadAloudPhase(item.id) !== null
  // Волна - только у ответа, который печатается на глазах: готовому из истории нечего проявлять.
  const [isLive] = useState(item.streaming)
  const { text } = useSmoothText(item.text, { done: !item.streaming })
  const reveal = useRevealOptions()
  const isRevealed = isLive && item.text.length <= REVEAL_LIMIT
  // Итог /code-review - вступление текстом, находки карточкой REVIEW (как в ACC).
  const review = useMemo(
    () => (item.streaming ? null : readReview(item.text)),
    [item.streaming, item.text],
  )

  const handleCopy = () => void navigator.clipboard.writeText(clipboardText(item.text))

  return (
    <div
      className={clsx(
        styles.assistantMessage,
        isPinned && styles.pinned,
        isReading && styles.reading,
      )}>
      <div className={styles.actions}>
        {/* В журнале чужого разговора закреплять некуда: полки закреплённых там нет. */}
        {!readOnly && <PinButton conversationId={conversationId} itemId={item.id} />}
        <ReadAloudButton itemId={item.id} text={item.text} />
        <MessageMenu>
          <MenuItem icon={Copy} label={t('agentPanel.message.copyReply')} onSelect={handleCopy} />
          {canRead && <ReadAloudItem itemId={item.id} text={item.text} />}
          {!readOnly && <PinItem conversationId={conversationId} itemId={item.id} />}
        </MessageMenu>
      </div>
      {review ? (
        <>
          {review.intro && <Markdown text={review.intro} />}
          <FindingsCard findings={review.findings} />
        </>
      ) : (
        <RevealContext value={isRevealed}>
          {isRevealed ? (
            // Одна волна на весь ответ: иначе каждый абзац начинал бы её заново.
            <RevealProvider resetKey={item.id} {...reveal}>
              <Markdown text={text} />
            </RevealProvider>
          ) : (
            <Markdown text={text} />
          )}
        </RevealContext>
      )}
    </div>
  )
})

AssistantMessage.displayName = 'AssistantMessage'
