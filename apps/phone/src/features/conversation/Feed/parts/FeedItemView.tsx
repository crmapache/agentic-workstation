import { memo } from 'react'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { isFeedStub } from '@agentic-workstation/remote-protocol/wire-types'

import styles from '../Feed.module.scss'
import type { OpenPhoto, FeedActions } from '../Feed.types'
import { flag, text } from '../Feed.utils'
import { ReadAloudButton } from '../../../read-aloud/ReadAloudButton/ReadAloudButton'
import { Markdown } from '../../../../shell/Markdown/Markdown'
import { EventLine } from './EventLine'
import { ShellItem } from './ShellItem'
import { StubItem } from './StubItem'
import { ThinkingItem } from './ThinkingItem'
import { ToolItem } from './ToolItem'
import { TurnLine } from './TurnLine'
import { UserItem } from './UserItem'

/**
 * Элемент ленты по виду. Ответ модели - в капсуле: видно, где кончились шаги хода и начался
 * ответ. Карточка (stub: элемент не влез в кадр и урезанным) - своя строка, а не элемент своего
 * вида без полей. Незнакомый вид (IDE новее телефона) не рисуется вовсе.
 * Действия (остановить задачу, откатить к сообщению, цитировать ответ, прочитать его вслух) -
 * только у ленты живого разговора.
 */
export const FeedItemView = memo(
  ({
    item,
    steps,
    actions,
    onOpenPhoto,
  }: {
    item: FeedItemWire
    steps: number
    actions: FeedActions | undefined
    onOpenPhoto: ((photo: OpenPhoto) => void) | undefined
  }) => {
    if (isFeedStub(item)) return <StubItem item={item} />

    switch (item.kind) {
      case 'user':
        return <UserItem item={item} onOpenPhoto={onOpenPhoto} onRewind={actions?.onRewind} />
      case 'assistant': {
        const bubble = (
          <div className={styles.assistant}>
            <Markdown text={text(item, 'text')} quotable={!!actions} />
          </div>
        )
        const reading = actions?.readAloud

        // Пока ответ пишется, читать нечего: текст ещё не тот, что останется.
        if (!reading || flag(item, 'streaming')) return bubble

        return (
          <div className={styles.assistantRow}>
            {bubble}
            <ReadAloudButton
              agentId={reading.agentId}
              conversationId={reading.conversationId}
              itemId={item.id}
            />
          </div>
        )
      }
      case 'thinking':
        return <ThinkingItem item={item} />
      case 'tool':
        return <ToolItem item={item} steps={steps} onStopTask={actions?.onStopTask} />
      case 'shell':
        return <ShellItem item={item} />
      case 'turn':
        return <TurnLine item={item} />
      case 'notice':
      case 'compact':
      case 'retry':
      case 'model':
      case 'limit':
        return <EventLine item={item} />
      default:
        return null
    }
  },
)

FeedItemView.displayName = 'FeedItemView'
