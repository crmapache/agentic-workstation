import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import type { ToolFeedItem } from '@shared/conversation-feed'

import type { CliMessage } from '../cli/cli-messages'
import { FeedBuilder } from './feed-builder'

/**
 * Настоящая запись CLI 2.1.293: агент ставит Monitor на команду с тремя строками вывода и
 * кончает ход; каждая строка - новый ход без нашего сообщения, конец команды - уведомление.
 */
const lines = readFileSync(join(import.meta.dirname, '__fixtures__/monitor.ndjson'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as CliMessage)

const MONITOR_ID = 'toolu_01G9w2Xe4oyLHPHBCTsxWDZC'

/** Строки до уведомления о конце наблюдателя: он ещё жив. */
const watching = lines.slice(
  0,
  lines.findIndex((line) => line.subtype === 'task_notification'),
)
const armed = lines.slice(0, lines.findIndex((line) => line.type === 'result') + 1)

const monitorCall = (builder: FeedBuilder) =>
  builder.items.find((item): item is ToolFeedItem => item.kind === 'tool' && item.id === MONITOR_ID)

/** Строки - как их разобрал бы разговор: итог хода - через finishTurn, как у process-router. */
const feed = (builder: FeedBuilder, messages: readonly CliMessage[]) => {
  for (const message of messages) {
    if (message.type === 'result') builder.finishTurn(message, false)
    else builder.apply(message)
  }
}

const notices = (builder: FeedBuilder) => builder.items.filter((item) => item.kind === 'notice')

describe('наблюдатель Monitor', () => {
  it('после конца хода он жив: держит процесс, но не зовёт вкладку работающей', () => {
    const builder = new FeedBuilder()

    feed(builder, armed)

    expect(monitorCall(builder)).toMatchObject({
      status: 'done',
      action: {
        kind: 'monitor',
        command: 'for i in 1 2 3; do echo tick $i; sleep 4; done',
        description: 'probe ticks',
      },
      task: { taskId: 'bbrochhp0', kind: 'monitor', background: true, outcome: null },
    })
    expect(builder.hasBackgroundCommands).toBe(true)
    expect(builder.hasBackgroundWork).toBe(false)
  })

  it('ходы по его событиям его не закрывают, уведомление о конце - закрывает', () => {
    const builder = new FeedBuilder()

    feed(builder, watching)

    expect(monitorCall(builder)?.task?.outcome).toBeNull()
    expect(builder.hasBackgroundCommands).toBe(true)

    feed(builder, lines.slice(watching.length))

    expect(monitorCall(builder)?.task).toMatchObject({
      outcome: 'completed',
      summary: 'Monitor "probe ticks" stream ended',
    })
    expect(builder.hasBackgroundCommands).toBe(false)
  })

  it('погиб с процессом - отметка наблюдателя с его описанием', () => {
    const builder = new FeedBuilder()

    feed(builder, armed)
    builder.abortBackground('exited')

    expect(monitorCall(builder)?.task?.outcome).toBe('stopped')
    expect(builder.hasBackgroundCommands).toBe(false)
    expect(notices(builder)).toMatchObject([
      { code: 'monitor-lost', detail: 'probe ticks', subject: 'exited' },
    ])
  })

  it('наблюдатель WebSocket - та же задача, а не карточка агента', () => {
    const builder = new FeedBuilder()

    builder.apply({
      type: 'assistant',
      message: {
        id: 'm-ws',
        content: [
          {
            type: 'tool_use',
            id: 'ws-1',
            name: 'Monitor',
            input: { ws: { url: 'wss://a.b/feed' }, description: 'Watch the feed' },
          },
        ],
      },
    })
    builder.apply({
      type: 'system',
      subtype: 'task_started',
      task_id: 'ws-task',
      tool_use_id: 'ws-1',
      task_type: 'monitor_ws',
    })

    expect(builder.items.filter((item) => item.kind === 'tool')).toHaveLength(1)
    expect(builder.items[0]).toMatchObject({
      action: { kind: 'monitor', url: 'wss://a.b/feed' },
      task: { taskId: 'ws-task', kind: 'monitor', outcome: null },
    })
    expect(builder.hasBackgroundCommands).toBe(true)
  })
})
