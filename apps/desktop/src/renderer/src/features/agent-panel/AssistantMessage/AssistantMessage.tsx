import { memo, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSmoothText, RevealProvider } from 'smooth-stream-text/react'

import { IconButton } from '@agentic-workstation/ui/IconButton'

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
import { useReadAloudAvailable } from '../ReadAloudButton/ReadAloudButton.hooks'
import { useCopy } from '../../../lib/clipboard.hooks'
import { REVEAL_LIMIT } from './AssistantMessage.constants'
import { useRevealOptions } from './AssistantMessage.hooks'
import styles from './AssistantMessage.module.scss'
import type { AssistantMessageProps } from './AssistantMessage.types'

/**
 * Ответ модели - карточка с рамкой (как в ACC): видно, где кончились шаги и начался
 * ответ. В углу, как у своего сообщения, - копия всего ответа, «прочитать вслух» (ADR 0106) и
 * три точки с булавкой, у закреплённого булавка горит и снаружи. CLI шлёт текст рывками -
 * smooth-stream-text выравнивает темп, а символы проступают волной; готовый ответ
 * (история, транскрипт) и очень длинный встают сразу.
 */
export const AssistantMessage = memo(({ item }: AssistantMessageProps) => {
  const { t } = useTranslation()
  const { conversationId, readOnly } = useFeedScope()
  const { isCopied, copy } = useCopy()
  const { isPinned } = usePin(conversationId, item.id)
  // Пока ответ пишется, читать нечего: текст ещё не тот, что останется.
  const canRead = useReadAloudAvailable() && !item.streaming
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

  const handleCopy = () => copy(clipboardText(item.text))

  return (
    <div
      className={clsx(styles.assistantMessage, isPinned && styles.pinned, canRead && styles.reads)}>
      <div className={styles.actions}>
        {/* В журнале чужого разговора закреплять некуда: полки закреплённых там нет. */}
        {!readOnly && <PinButton conversationId={conversationId} itemId={item.id} />}
        <IconButton
          icon={isCopied ? Check : Copy}
          size="sm"
          label={isCopied ? t('agentPanel.message.copied') : t('agentPanel.message.copyReply')}
          onClick={handleCopy}
        />
        {canRead && <ReadAloudButton itemId={item.id} text={item.text} />}
        {!readOnly && (
          <MessageMenu>
            <PinItem conversationId={conversationId} itemId={item.id} />
          </MessageMenu>
        )}
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
