import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../QueueCard.module.scss'
import type { QueueNameProps } from '../QueueCard.types'
import { QueueNameField } from './QueueNameField'

/**
 * Имя очереди - заголовок полосы. Двойной клик (или «Rename» в меню) ставит на его место поле:
 * имя от ИИ - лишь догадка по содержимому, и человек называет работу по-своему.
 */
export const QueueName = ({ queue, isRenaming, onRenaming }: QueueNameProps) => {
  const { t } = useTranslation()

  const handleDone = () => onRenaming(false)

  const handleDoubleClick = () => onRenaming(true)

  if (isRenaming) return <QueueNameField queue={queue} onDone={handleDone} />

  return (
    <Tooltip label={t('scenarios.queues.name.hint')} stretch>
      <h3 className={styles.name} onDoubleClick={handleDoubleClick}>
        {queue.name}
      </h3>
    </Tooltip>
  )
}
