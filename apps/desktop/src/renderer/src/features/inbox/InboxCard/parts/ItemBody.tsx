import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { CodeSnippet } from '@agentic-workstation/ui/CodeSnippet'

import styles from '../InboxCard.module.scss'
import type { ItemPartProps } from '../InboxCard.types'
import { subjectOf } from '../InboxCard.utils'
import { useConversationLog } from '../../../../state/conversation-log.context'

/**
 * Суть уведомления: заголовок, текст в разметке (отчёт, план, сообщение ИИ) той же разметкой, что
 * лента разговора, у разрешения - что именно хотят сделать, у сбоя - почему.
 */
export const ItemBody = ({ item }: ItemPartProps) => {
  const { t } = useTranslation()
  const log = useConversationLog()
  const subject = subjectOf(item)
  const plain = <div className={styles.text}>{item.body}</div>

  return (
    <>
      {subject && <div className={styles.title}>{subject}</div>}
      {item.kind === 'failure' && (
        <div className={styles.failure}>
          {t(`tasks.failures.${item.reason}`, { defaultValue: t('tasks.codes.unknown') })}
        </div>
      )}
      {item.kind === 'permission' && (
        <>
          <div className={styles.questionText}>
            {t('inbox.permission.run')}
            <Badge variant="soft">{item.tool}</Badge>
          </div>
          {item.detail && (
            <CodeSnippet
              code={item.detail}
              copyLabel={t('inbox.permission.copy')}
              copiedLabel={t('inbox.permission.copied')}
            />
          )}
        </>
      )}
      {item.body &&
        (log ? (
          <Suspense fallback={plain}>
            <log.Text text={item.body} />
          </Suspense>
        ) : (
          plain
        ))}
      {item.kind === 'failure' && item.detail && <div className={styles.text}>{item.detail}</div>}
    </>
  )
}
