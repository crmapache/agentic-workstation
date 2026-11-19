import { it, expect, describe } from 'vitest'

import { CodexFeedBuilder } from './codex-feed-builder'

/** Сборщик с часами теста: каждое «сейчас» - на 10 мс позже. */
const builder = () => {
  let clock = 1_000

  return new CodexFeedBuilder(
    () => '',
    () => {
      clock += 10

      return clock
    },
  )
}

describe('лента Codex', () => {
  it('ход: сообщение, ответ кусками, команда, правка, строка хода с файлами', () => {
    const feed = builder()

    feed.addUserMessage('u1', 'add a function', [], false)
    feed.turnStarted()
    feed.appendText('a1', 'assistant', 'Adding ', null)
    feed.appendText('a1', 'assistant', 'it now.', null)
    feed.putItem(
      { type: 'commandExecution', id: 'c1', command: 'cat x.ts', status: 'inProgress' },
      null,
      false,
    )
    feed.putItem(
      {
        type: 'commandExecution',
        id: 'c1',
        command: 'cat x.ts',
        status: 'completed',
        exitCode: 0,
        aggregatedOutput: 'x',
      },
      null,
      true,
    )
    feed.putItem(
      {
        type: 'fileChange',
        id: 'f1',
        status: 'completed',
        changes: [{ path: '/p/x.ts', kind: { type: 'update' }, diff: '@@ -1 +1,2 @@\n a\n+b\n' }],
      },
      null,
      true,
    )
    feed.putItem({ type: 'agentMessage', id: 'a1', text: 'Adding it now.' }, null, true)
    feed.turnCompleted({ status: 'completed', error: '' })

    const kinds = feed.items.map((item) => item.kind)
    const turn = feed.items.at(-1)

    expect(kinds).toEqual(['user', 'assistant', 'tool', 'tool', 'turn'])
    expect(feed.items[1]).toMatchObject({ text: 'Adding it now.', streaming: false })
    expect(feed.items[2]).toMatchObject({ status: 'done', action: { kind: 'command' } })
    expect(turn).toMatchObject({
      kind: 'turn',
      interrupted: false,
      isError: false,
      changes: [{ path: '/p/x.ts', added: 1, removed: 0, created: false, counted: true }],
    })
  })

  it('остановка: незаконченное прервано, ход помечен остановленным; обрыв - отметкой', () => {
    const feed = builder()

    feed.addUserMessage('u1', 'run', [], false)
    feed.turnStarted()
    feed.putItem(
      { type: 'commandExecution', id: 'c1', command: 'sleep 9', status: 'inProgress' },
      null,
      false,
    )
    feed.noteStopped('you')
    feed.turnCompleted({ status: 'interrupted', error: '' })

    expect(feed.items.find((item) => item.id === 'c1')).toMatchObject({
      status: 'interrupted',
      closedReason: 'stopped',
    })
    expect(feed.items.at(-1)).toMatchObject({ kind: 'turn', interrupted: true })

    feed.addUserMessage('u2', 'again', [], false)
    feed.putItem(
      { type: 'commandExecution', id: 'c2', command: 'sleep 9', status: 'inProgress' },
      null,
      false,
    )
    feed.abortTurn('process-exited', 'boom')

    expect(feed.items.find((item) => item.id === 'c2')).toMatchObject({ closedReason: 'exited' })
    expect(feed.items.at(-1)).toMatchObject({
      kind: 'notice',
      code: 'process-exited',
      detail: 'boom',
    })
  })

  it('план - задачи над полем; заплатка отдаёт их один раз', () => {
    const feed = builder()

    feed.planUpdated([
      { step: 'Read code', status: 'completed' },
      { step: 'Write test', status: 'inProgress' },
    ])

    expect(feed.drain().tasks).toEqual([
      { id: '1', subject: 'Read code', activeForm: 'Read code', state: 'completed' },
      { id: '2', subject: 'Write test', activeForm: 'Write test', state: 'in_progress' },
    ])
    expect(feed.drain().tasks).toBeUndefined()
  })

  it('сообщение, кончившееся пустым, в ленту не встаёт', () => {
    const feed = new CodexFeedBuilder()

    feed.putItem({ type: 'agentMessage', id: 'm1', text: '' }, null, false)
    feed.putItem({ type: 'agentMessage', id: 'm1', text: '' }, null, true)
    expect(feed.items).toEqual([])
  })
})
