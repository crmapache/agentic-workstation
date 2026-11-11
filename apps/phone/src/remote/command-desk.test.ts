import { it, vi, expect, describe, afterEach } from 'vitest'

import { PART_CHARS } from '@agentic-workstation/remote-protocol/parts'

import { CommandDesk, RESULT_PATIENCE_MS } from './command-desk'

const desk = (options: { open?: boolean; caps?: string[] } = {}) => {
  const sent: Record<string, unknown>[] = []
  const commands = new CommandDesk({
    send: (_agentId, message) => {
      sent.push(message as Record<string, unknown>)

      return Promise.resolve(true)
    },
    whenOpen: () => Promise.resolve(options.open ?? true),
    caps: () => options.caps ?? ['parts'],
  })

  return { commands, sent }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.useRealTimers()
})

describe('команды телефона', () => {
  it('кривые аргументы отказываются здесь и не уходят', async () => {
    const { commands, sent } = desk()
    const outcome = await commands.run('agent', 'conversation.new', {
      projectKey: 'p-short',
      provider: 'claude',
    })

    expect(outcome).toEqual({ ok: false, code: 'badArgs' })
    expect(sent).toEqual([])
  })

  it('ответ находит команду по id', async () => {
    const { commands, sent } = desk()
    const running = commands.run('agent', 'conversation.interrupt', { conversationId: 'c-1' })

    await flush()
    expect(sent[0]).toMatchObject({ p: 1, k: 'cmd', name: 'conversation.interrupt' })
    commands.result({ p: 1, k: 'result', id: String(sent[0]?.['id']), ok: true })
    expect(await running).toEqual({ ok: true, data: undefined })
  })

  it('отказ IDE - её кодом и словом', async () => {
    const { commands, sent } = desk()
    const running = commands.run('agent', 'scenarios.carryOn', { runId: 'r1' })

    await flush()
    commands.result({
      p: 1,
      k: 'result',
      id: String(sent[0]?.['id']),
      ok: false,
      code: 'refused',
      detail: 'runNotResumable',
    })
    expect(await running).toEqual({ ok: false, code: 'refused', detail: 'runNotResumable' })
  })

  it('нет линии - offline сразу', async () => {
    const { commands } = desk({ open: false })

    expect(await commands.run('agent', 'scenarios.carryOn', { runId: 'r1' })).toEqual({
      ok: false,
      code: 'offline',
    })
  })

  it('фото тяжелее кадра - частями, если IDE их умеет; иначе tooBig', async () => {
    const data = 'A'.repeat(300_000)
    const args = {
      conversationId: 'c-1',
      text: 'look',
      images: [{ mediaType: 'image/png' as const, data }],
    }
    const { commands, sent } = desk()

    void commands.run('agent', 'conversation.send', args)
    await flush()

    expect(sent.every((part) => part['k'] === 'part')).toBe(true)
    expect(sent.length).toBe(
      Math.ceil(
        JSON.stringify({ p: 1, k: 'cmd', id: sent[0]?.['id'], name: 'conversation.send', args })
          .length / PART_CHARS,
      ),
    )
    expect(sent.map((part) => part['d']).join('')).toContain(data)

    const old = desk({ caps: [] })

    expect(await old.commands.run('agent', 'conversation.send', args)).toEqual({
      ok: false,
      code: 'tooBig',
    })
  })

  it('без ответа - timeout; IDE забыта - все ждущие кончаются сразу', async () => {
    vi.useFakeTimers()

    const { commands } = desk()
    const late = commands.run('agent', 'scenarios.carryOn', { runId: 'r1' })

    await vi.advanceTimersByTimeAsync(RESULT_PATIENCE_MS + 1)
    expect(await late).toEqual({ ok: false, code: 'timeout' })

    const waiting = commands.run('agent', 'scenarios.carryOn', { runId: 'r2' })

    await vi.advanceTimersByTimeAsync(1)
    commands.failAll('agent', 'gone')
    expect(await waiting).toEqual({ ok: false, code: 'gone' })
  })
})
