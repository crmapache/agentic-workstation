import { it, vi, expect, describe, afterEach } from 'vitest'

import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'
import { MAX_IMAGES_CHARS } from '@agentic-workstation/remote-protocol/message-size'

import { CommandDesk, RESEND_WINDOW_MS, RESULT_PATIENCE_MS } from './command-desk'

const desk = (options: { open?: boolean; caps?: string[]; now?: () => number } = {}) => {
  const sent: Record<string, unknown>[] = []
  const commands = new CommandDesk({
    send: (_agentId, message) => {
      sent.push(message as Record<string, unknown>)

      return Promise.resolve(true)
    },
    whenOpen: () => Promise.resolve(options.open ?? true),
    caps: () => options.caps ?? ['parts'],
    ...(options.now && { now: options.now }),
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
    expect(sent.length).toBeGreaterThanOrEqual(2)
    // Каждый кусок с конвертом влезает в кадр - по байтам на проводе, не по знакам.
    for (const part of sent) expect(encodeBody(part).length).toBeLessThanOrEqual(MAX_BODY_BYTES)
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

  it('сообщение тяжелее общего потолка - tooBig здесь, не уходя', async () => {
    const { commands, sent } = desk()
    // Фото на весь свой потолок и текст из управляющих знаков (по шесть байт в JSON): схема
    // такое пускает, а собранное сообщение тяжелее MAX_MESSAGE_BYTES.
    const outcome = await commands.run('agent', 'conversation.send', {
      conversationId: 'c-1',
      text: '\u0001'.repeat(100_000),
      images: [{ mediaType: 'image/png', data: 'A'.repeat(MAX_IMAGES_CHARS) }],
    })

    expect(outcome).toEqual({ ok: false, code: 'tooBig' })
    expect(sent).toEqual([])
  })

  it('после resync команда без итога уходит снова тем же id - и частями тоже', async () => {
    let now = 0
    const { commands, sent } = desk({ now: () => now })
    const photo = commands.run('agent', 'conversation.send', {
      conversationId: 'c-1',
      text: 'look',
      images: [{ mediaType: 'image/png', data: 'A'.repeat(300_000) }],
    })
    const stop = commands.run('agent', 'conversation.interrupt', { conversationId: 'c-1' })

    await flush()

    const first = [...sent]

    commands.resend('agent')
    await flush()
    // Те же слова, те же id, тем же порядком.
    expect(sent.slice(first.length)).toEqual(first)

    // Итог одной - она больше не повторяется; чужая IDE - не трогается.
    const stopId = String(first.find((message) => message['k'] === 'cmd')?.['id'])

    commands.result({ p: 1, k: 'result', id: stopId, ok: true })
    expect(await stop).toEqual({ ok: true, data: undefined })
    commands.resend('other')
    await flush()
    expect(sent).toHaveLength(first.length * 2)

    // Старше окна повтора - не повторяется: IDE могла забыть её итог и выполнить второй раз.
    now = RESEND_WINDOW_MS
    commands.resend('agent')
    await flush()
    expect(sent).toHaveLength(first.length * 2)

    commands.failAll('agent', 'gone')
    expect(await photo).toEqual({ ok: false, code: 'gone' })
  })

  it('слово IDE о не собравшемся или отброшенном сообщении кончает команду сразу', async () => {
    const { commands, sent } = desk()
    const photo = commands.run('agent', 'conversation.send', {
      conversationId: 'c-1',
      text: 'look',
      images: [{ mediaType: 'image/png', data: 'A'.repeat(300_000) }],
    })

    await flush()
    commands.noticed({
      p: 1,
      k: 'notice',
      level: 'warning',
      code: 'partsRefused',
      about: String(sent[0]?.['id']),
    })
    expect(await photo).toEqual({ ok: false, code: 'partsRefused' })

    const limited = commands.run('agent', 'conversation.send', {
      conversationId: 'c-1',
      text: 'again',
      images: [{ mediaType: 'image/png', data: 'A'.repeat(300_000) }],
    })

    await flush()
    commands.noticed({
      p: 1,
      k: 'notice',
      level: 'warning',
      code: 'rateLimited',
      about: String(sent.at(-1)?.['id']),
    })
    expect(await limited).toEqual({ ok: false, code: 'rateLimited' })
  })
})
