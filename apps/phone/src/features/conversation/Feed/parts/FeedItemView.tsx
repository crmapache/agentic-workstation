import { memo } from 'react'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { isFeedStub } from '@agentic-workstation/remote-protocol/wire-types'

import { text } from '../Feed.utils'
import { Markdown } from '../../../../shell/Markdown/Markdown'
import { EventLine } from './EventLine'
import { ShellItem } from './ShellItem'
import { StubItem } from './StubItem'
import { ThinkingItem } from './ThinkingItem'
import { ToolItem } from './ToolItem'
import { UserItem } from './UserItem'

/**
 * Элемент ленты по виду. Карточка (stub: элемент не влез в кадр и урезанным) - своя строка, а не
 * элемент своего вида без полей. Незнакомый вид (IDE новее телефона) не рисуется вовсе.
 */
export const FeedItemView = memo(({ item, steps }: { item: FeedItemWire; steps: number }) => {
  if (isFeedStub(item)) return <StubItem item={item} />

  switch (item.kind) {
    case 'user':
      return <UserItem item={item} />
    case 'assistant':
      return <Markdown text={text(item, 'text')} />
    case 'thinking':
      return <ThinkingItem item={item} />
    case 'tool':
      return <ToolItem item={item} steps={steps} />
    case 'shell':
      return <ShellItem item={item} />
    case 'turn':
    case 'notice':
    case 'compact':
    case 'retry':
    case 'model':
    case 'limit':
      return <EventLine item={item} />
    default:
      return null
  }
})

FeedItemView.displayName = 'FeedItemView'
