import { isInboxAsking } from '@shared/inbox'

import styles from '../TaskRunModal.module.scss'
import type { RunPartProps } from '../TaskRunModal.types'
import { useInboxCard } from '../../../../state/inbox-card.context'
import { useInbox } from '../../../../state/inbox.queries'

/**
 * Вопросы, на которых прогон стоит, - наверху окна той же карточкой, что в уведомлениях (её даёт
 * workbench): ответ здесь и там - одно и то же нажатие.
 */
export const RunAsking = ({ run }: RunPartProps) => {
  const Card = useInboxCard()
  const items =
    useInbox().data?.items.filter(
      (item) => isInboxAsking(item) && item.origin.kind === 'task' && item.origin.runId === run.id,
    ) ?? []

  if (!Card || items.length === 0) return null

  return (
    <div className={styles.asking}>
      {items.map((item) => (
        <Card key={item.id} item={item} />
      ))}
    </div>
  )
}
