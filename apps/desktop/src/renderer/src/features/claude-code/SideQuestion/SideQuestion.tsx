import { useRef, useMemo, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { AsideExchange } from '@shared/claude-panel'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useAsideThread, useAsideActions } from '../aside.queries'
import { useClaudeCodeStore } from '../claude-code.store'
import { FeedScopeContext } from '../feed-scope.context'
import styles from './SideQuestion.module.scss'
import type { SideQuestionProps } from './SideQuestion.types'
import { lastMark } from './SideQuestion.utils'
import { AsideExchangeView } from './parts/AsideExchangeView'

/**
 * Вопросы сбоку (/btw) - карточка над полем, а не реплики в ленте (как в ACC): агент
 * этой цепочки не видит, в транскрипт она не пишется, и в ленте, растущей под идущим
 * ходом, ответ уехал бы из вида. Рамка говорит то же словами: «Claude doesn't see this»
 * и «Not saved to the chat»; «Ask in the chat» переносит вопрос в поле обычным сообщением.
 */
export const SideQuestion = ({ conversation }: SideQuestionProps) => {
  const { t } = useTranslation()
  const thread = useAsideThread(conversation.id)
  const actions = useAsideActions()
  const fillDraft = useClaudeCodeStore((store) => store.fillDraft)
  const bodyRef = useRef<HTMLDivElement>(null)
  const mark = lastMark(thread.exchanges)
  const last = thread.exchanges.at(-1)
  const scope = useMemo(
    () => ({ conversationId: conversation.id, projectPath: conversation.projectPath }),
    [conversation.id, conversation.projectPath],
  )

  // Новый вопрос и новый ответ встают вниз - туда и смотрят; чтение выше не дёргается.
  useEffect(() => {
    const body = bodyRef.current

    if (body) body.scrollTop = body.scrollHeight
  }, [mark, thread.open])

  if (!thread.open) return null

  const handleClose = () => void actions.show(conversation.id, false)

  const handleCancel = (askId: string) => void actions.cancel(conversation.id, askId)

  const handleAskAgain = (exchange: AsideExchange) =>
    void actions.ask(conversation.id, exchange.question, exchange.id)

  const handleAskInChat = () => last && fillDraft(conversation.id, last.question)

  return (
    <FeedScopeContext value={scope}>
      <section className={styles.sideQuestion} aria-label={t('claudeCode.aside.title')}>
        <div className={styles.head}>
          <span className={styles.label}>{t('claudeCode.aside.title')}</span>
          <span className={styles.unseen}>{t('claudeCode.aside.unseen')}</span>
          <span className={styles.spacer} />
          <IconButton
            icon={X}
            size="sm"
            label={t('claudeCode.aside.close')}
            onClick={handleClose}
          />
        </div>
        <div ref={bodyRef} className={styles.body}>
          {thread.exchanges.length === 0 ? (
            <p className={styles.hint}>{t('claudeCode.aside.hint')}</p>
          ) : (
            thread.exchanges.map((exchange) => (
              <AsideExchangeView
                key={exchange.id}
                exchange={exchange}
                onCancel={handleCancel}
                onAskAgain={handleAskAgain}
              />
            ))
          )}
        </div>
        {last && (
          <div className={styles.foot}>
            <span className={styles.notSaved}>{t('claudeCode.aside.notSaved')}</span>
            <span className={styles.spacer} />
            <Tooltip label={t('claudeCode.aside.askInChatHint')} placement="top">
              <Button size="sm" variant="ghost" onClick={handleAskInChat}>
                {t('claudeCode.aside.askInChat')}
              </Button>
            </Tooltip>
          </div>
        )}
      </section>
    </FeedScopeContext>
  )
}
