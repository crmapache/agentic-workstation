import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import type { CliMessage } from '../cli/cli-messages'
import { parseCliLine } from '../cli/cli-messages'
import { FeedBuilder } from './feed-builder'

/*
 * Фикстура - настоящий поток Claude Code 2.1.293 (haiku): список задач, Read, Edit,
 * Bash и ответ с разметкой. Пути заменены на /Users/dev/project, служебные строки
 * хуков и полные списки команд вырезаны.
 */
const fixture = readFileSync(join(import.meta.dirname, '__fixtures__/turn.ndjson'), 'utf8')
  .split('\n')
  .map(parseCliLine)
  .filter((message): message is CliMessage => message !== null)

/** Часы, которые идут на 100 мс при каждом взгляде: у хода есть длительность. */
const tickingClock = () => {
  let now = 1_000_000

  return () => (now += 100)
}

const playFixture = () => {
  const builder = new FeedBuilder(undefined, tickingClock())

  for (const message of fixture) {
    if (message.type === 'result') builder.finishTurn(message, false)
    else builder.apply(message)
  }

  return builder
}

describe('сборка ленты из потока CLI', () => {
  it('вызовы получают результат и статус', () => {
    const tools = playFixture().items.filter((item) => item.kind === 'tool')
    const byName = (name: string) => tools.find((tool) => tool.name === name)

    expect(tools.every((tool) => tool.status === 'done')).toBe(true)
    expect(byName('Bash')?.result?.stdout).toContain('notes.txt')
    expect(byName('Edit')?.result?.patch?.[0]?.lines).toEqual([' alpha', '-beta', '+gamma'])
    expect(byName('Read')?.input['file_path']).toBe('/Users/dev/project/notes.txt')
  })

  it('ответ модели - один элемент, дописанный потоком и закрытый', () => {
    const answers = playFixture().items.filter((item) => item.kind === 'assistant')

    expect(answers).toHaveLength(1)
    expect(answers[0]?.streaming).toBe(false)
    expect(answers[0]?.text).toMatch(/^\*\*Готово/)
  })

  it('размышления видны счётом токенов, текст скрыт', () => {
    const thoughts = playFixture().items.filter((item) => item.kind === 'thinking')

    expect(thoughts.length).toBeGreaterThan(0)
    expect(thoughts.every((thought) => !thought.streaming && thought.tokens > 0)).toBe(true)
  })

  it('список задач собран из TaskCreate и TaskUpdate', () => {
    const tasks = playFixture().tasks.map(({ id, subject, state }) => ({ id, subject, state }))

    expect(tasks).toEqual([
      { id: '1', subject: 'Read notes', state: 'completed' },
      { id: '2', subject: 'Edit notes', state: 'completed' },
    ])
  })

  it('ход закрывается итогом с ценой и временем', () => {
    const turn = playFixture().items.at(-1)

    expect(turn?.kind).toBe('turn')
    expect(turn?.kind === 'turn' && turn.costUsd).toBeGreaterThan(0)
    expect(turn?.kind === 'turn' && turn.durationMs).toBeGreaterThan(0)
  })

  it('окну уходят только тронутые элементы', () => {
    const builder = new FeedBuilder()
    const [, ...rest] = fixture

    for (const message of rest.slice(0, 40)) builder.apply(message)

    expect(builder.drain().upserts.length).toBeGreaterThan(0)
    expect(builder.drain().upserts).toEqual([])
  })
})

describe('конец хода', () => {
  it('итог локальной команды без шагов - ход со своей ценой (рукопожатие отсеивает разговор)', () => {
    const builder = new FeedBuilder()

    builder.finishTurn(
      { type: 'result', num_turns: 0, result: '', local_command: 'compact', total_cost_usd: 0.01 },
      false,
    )

    expect(builder.items).toEqual([expect.objectContaining({ kind: 'turn', costUsd: 0.01 })])
  })

  it('незаконченный вызов при остановке помечается прерванным', () => {
    const builder = new FeedBuilder()

    builder.apply({
      type: 'assistant',
      message: {
        id: 'm1',
        content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'sleep 9' } }],
      },
      parent_tool_use_id: null,
    })
    builder.finishTurn({ type: 'result', num_turns: 1, result: '', is_error: true }, true)

    expect(builder.items[0]).toMatchObject({ kind: 'tool', status: 'interrupted' })
    expect(builder.items.at(-1)).toMatchObject({ kind: 'turn', interrupted: true, isError: false })
  })

  it('цена хода после нового процесса - от его нуля', () => {
    const builder = new FeedBuilder()
    const result = (total: number): CliMessage => ({
      type: 'result',
      num_turns: 1,
      result: 'ok',
      total_cost_usd: total,
    })

    builder.finishTurn(result(0.05), false)
    builder.startProcess()
    builder.finishTurn(result(0.4), false)

    const costs = builder.items.flatMap((item) => (item.kind === 'turn' ? [item.costUsd] : []))

    expect(costs).toEqual([0.05, 0.4])
  })

  it('цена хода - разница нарастающего итога сессии', () => {
    const builder = new FeedBuilder()
    const result = (total: number): CliMessage => ({
      type: 'result',
      num_turns: 1,
      result: 'ok',
      total_cost_usd: total,
    })

    builder.finishTurn(result(0.5), false)
    builder.finishTurn(result(0.75), false)

    const costs = builder.items.flatMap((item) => (item.kind === 'turn' ? [item.costUsd] : []))

    expect(costs).toEqual([0.5, 0.25])
  })
})

describe('транскрипт', () => {
  it('сообщения человека берутся из транскрипта, команды - как /команда', () => {
    const builder = new FeedBuilder()

    builder.apply({ type: 'user', uuid: 'u1', message: { content: 'hello' } }, true)
    builder.apply(
      {
        type: 'user',
        uuid: 'u2',
        message: {
          content:
            '<command-message>review</command-message><command-name>/review</command-name><command-args>42</command-args>',
        },
      },
      true,
    )
    builder.apply({ type: 'user', uuid: 'u3', isMeta: true, message: { content: 'meta' } }, true)

    expect(builder.items.map((item) => (item.kind === 'user' ? item.text : item.kind))).toEqual([
      'hello',
      '/review 42',
    ])
  })

  it('живой поток сообщения человека не дублирует', () => {
    const builder = new FeedBuilder()

    builder.apply({ type: 'user', message: { content: 'hello' } }, false)

    expect(builder.items).toEqual([])
  })

  it('написанное посреди хода - из вложения очереди, под нашим uuid', () => {
    const builder = new FeedBuilder()
    const queued = (uuid: string, mode: string, prompt: unknown): CliMessage => ({
      type: 'attachment',
      uuid,
      attachment: {
        type: 'queued_command',
        prompt,
        source_uuid: `${uuid}-ours`,
        commandMode: mode,
      },
    })
    const picture = {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'AA' },
    }

    builder.apply(
      queued('a1', 'prompt', [picture, { type: 'text', text: '[Image #1] look' }]),
      true,
    )
    builder.apply(
      queued('a2', 'task-notification', '<task-notification>done</task-notification>'),
      true,
    )
    // Живое вложение лента не повторяет: сообщение стоит в ней с отправки.
    builder.apply(queued('a3', 'prompt', 'live'), false)

    expect(builder.items).toEqual([
      expect.objectContaining({
        kind: 'user',
        id: 'a1-ours',
        text: '[Image #1] look',
        images: [{ thumbnail: '' }],
        steering: true,
      }),
    ])
  })

  it('отказ в разрешении - статус denied, а не ошибка', () => {
    const builder = new FeedBuilder()

    builder.apply({
      type: 'assistant',
      message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Write', input: {} }] },
    })
    builder.apply({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'no' }],
      },
      tool_result_meta: [{ id: 't1', non_execution_kind: 'user-rejected' }],
    })

    expect(builder.items[0]).toMatchObject({ status: 'denied' })
  })
})

describe('фоновый субагент', () => {
  const launch = (builder: FeedBuilder) => {
    builder.apply({
      type: 'assistant',
      message: { id: 'm1', content: [{ type: 'tool_use', id: 'a1', name: 'Agent', input: {} }] },
    })
    builder.apply({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'a1', content: 'Async agent launched successfully.' },
        ],
      },
    })
  }

  it('идёт после конца хода и закрывается уведомлением с итогом', () => {
    const builder = new FeedBuilder()

    launch(builder)
    builder.finishTurn({ type: 'result', num_turns: 1, result: 'ok' }, false)

    expect(builder.items[0]).toMatchObject({ status: 'running', result: null })

    builder.apply({
      type: 'system',
      subtype: 'task_notification',
      tool_use_id: 'a1',
      status: 'completed',
      summary: 'Found 3 files',
    })

    expect(builder.items[0]).toMatchObject({ status: 'done', result: { text: 'Found 3 files' } })
  })

  it('в транскрипте без уведомления закрыт: как кончился, транскрипт не знает', () => {
    const builder = new FeedBuilder()

    launch(builder)
    builder.finishReplay()

    expect(builder.items[0]).toMatchObject({ status: 'interrupted', closedReason: 'replay' })
  })
})

describe('откат к сообщению', () => {
  it('сообщение и всё после уходит, список задач - каким был до него', () => {
    const builder = new FeedBuilder()

    builder.addUserMessage('u1', 'first', [], false)
    builder.drain()

    const tasksBefore = builder.tasks

    for (const message of fixture) {
      if (message.type === 'result') builder.finishTurn(message, false)
      else builder.apply(message)
    }

    builder.addUserMessage('u2', 'second', [], false)
    builder.drain()
    builder.truncateFrom('u1')

    const changes = builder.drain()

    expect(builder.items).toEqual([])
    expect(changes.removes).toContain('u1')
    expect(changes.removes).toContain('u2')
    expect(changes.upserts).toEqual([])
    expect(changes.tasks).toEqual(tasksBefore)
  })

  it('чужой id ничего не трогает', () => {
    const builder = new FeedBuilder()

    builder.addUserMessage('u1', 'first', [], false)
    builder.truncateFrom('missing')

    expect(builder.items.map((item) => item.id)).toEqual(['u1'])
  })
})
