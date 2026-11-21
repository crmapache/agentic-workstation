import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import type { ToolFeedItem } from '@shared/conversation-feed'

import type { CliMessage } from '../cli/cli-messages'
import { FeedBuilder } from './feed-builder'

/**
 * Настоящая запись CLI 2.1.293: агент ставит будильник на 60 с, кончает ход, через минуту CLI
 * сам начинает ход без нашего сообщения (command_lifecycle, init) и агент отвечает.
 */
const lines = readFileSync(join(import.meta.dirname, '__fixtures__/wakeup.ndjson'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as CliMessage)

const WAKEUP_ID = 'toolu_01G4Zx4N1FNHZDAXT1GHUYpB'
/** Срок из записи (scheduledFor) и миг перед ним. */
const DUE = 1_795_288_680_000
const BEFORE_DUE = DUE - 60_000

/** Строки записи по порядку, пока не встретится init второго хода (он - срабатывание). */
const scheduled = lines.slice(
  0,
  lines.findIndex((line, index) => index > 0 && line.subtype === 'init'),
)
const fired = lines.slice(scheduled.length)

const wakeupCall = (builder: FeedBuilder) =>
  builder.items.find((item): item is ToolFeedItem => item.kind === 'tool' && item.id === WAKEUP_ID)

/** Строки - как их разобрал бы разговор: итог хода - через finishTurn, как у process-router. */
const feed = (builder: FeedBuilder, messages: readonly CliMessage[]) => {
  for (const message of messages) {
    if (message.type === 'result') builder.finishTurn(message, false)
    else builder.apply(message)
  }
}

const builderAt = (time: { now: number }) => new FeedBuilder(undefined, () => time.now)

describe('будильник агента', () => {
  it('встаёт по результату вызова со сроком из scheduledFor и с тем, с чем разбудит', () => {
    const time = { now: BEFORE_DUE }
    const builder = builderAt(time)

    feed(builder, scheduled)

    expect(builder.hasWakeup).toBe(true)
    expect(wakeupCall(builder)?.task).toMatchObject({
      kind: 'wakeup',
      dueAt: DUE,
      outcome: null,
      activity: 'WAKE-PROBE: reply with the single word awake',
    })
  })

  it('ход, который CLI начал в срок, - это он сработал', () => {
    const time = { now: BEFORE_DUE }
    const builder = builderAt(time)

    feed(builder, scheduled)
    time.now = DUE + 300
    feed(builder, fired)

    expect(builder.hasWakeup).toBe(false)
    expect(wakeupCall(builder)?.task?.outcome).toBe('completed')
    expect(builder.items.some((item) => item.kind === 'notice')).toBe(false)
  })

  it('ход до срока будильник не снимает', () => {
    const time = { now: BEFORE_DUE }
    const builder = builderAt(time)

    feed(builder, scheduled)
    builder.apply({ type: 'system', subtype: 'init' })
    builder.finishTurn({ type: 'result', num_turns: 1, result: 'ok' }, false)

    expect(builder.hasWakeup).toBe(true)
  })

  it('процесс ушёл раньше срока - будильник пропал, и лента это говорит', () => {
    const time = { now: BEFORE_DUE }
    const builder = builderAt(time)

    feed(builder, scheduled)
    builder.abortBackground('restarted')

    expect(builder.hasWakeup).toBe(false)
    expect(wakeupCall(builder)?.task?.outcome).toBe('stopped')
    expect(builder.items.filter((item) => item.kind === 'notice')).toMatchObject([
      { code: 'wakeup-lost', detail: String(DUE), subject: 'restarted' },
    ])
  })

  it('stop снимает будильник, новый заменяет прежний - без отметок', () => {
    const time = { now: BEFORE_DUE }
    const builder = builderAt(time)
    const wake = (id: string, input: Record<string, unknown>, structured: unknown) => {
      builder.apply({
        type: 'assistant',
        message: {
          id: `m-${id}`,
          content: [{ type: 'tool_use', id, name: 'ScheduleWakeup', input }],
        },
      })
      builder.apply({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
        tool_use_result: structured,
      })
    }

    feed(builder, scheduled)
    wake('w2', { delaySeconds: 120, prompt: 'next' }, { scheduledFor: DUE + 60_000 })

    expect(wakeupCall(builder)?.task?.outcome).toBe('completed')
    expect(builder.hasWakeup).toBe(true)

    wake('w3', { stop: true }, {})

    expect(builder.hasWakeup).toBe(false)

    builder.abortBackground()

    expect(builder.items.some((item) => item.kind === 'notice')).toBe(false)
  })

  it('из транскрипта будильник не встаёт: процесса, который его держал, уже нет', () => {
    const builder = builderAt({ now: BEFORE_DUE })

    for (const message of scheduled) builder.apply(message, true)

    expect(builder.hasWakeup).toBe(false)
    expect(wakeupCall(builder)?.task).toBeUndefined()
  })
})
