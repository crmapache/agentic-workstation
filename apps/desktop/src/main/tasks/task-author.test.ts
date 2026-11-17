import { it, vi, expect, describe } from 'vitest'

import { TaskAuthor } from './task-author'
import type { AuthorAnswer, TaskAuthorHost } from './task-author'

const OUTPUT = {
  kind: 'schedule',
  name: 'Inbox digest',
  prompt: 'Read the inbox.',
  repeat: 'daily',
  time: '09:00',
  days: [1, 2, 3, 4, 5],
  monthDay: 1,
  date: '',
  catchUp: true,
  report: true,
  lifeDays: 7,
  budgetUsd: 5,
  outbound: 'confirm',
}

/** Хозяин без провайдера: ответ модели - заданный, коннектор - один Gmail. */
const host = (ask: TaskAuthorHost['ask']): TaskAuthorHost => ({
  ask,
  connectors: () => [{ server: 'gmail-work', title: 'Gmail mailbox', description: 'Work mail' }],
  now: () => new Date(2026, 10, 17, 16, 30),
})

describe('TaskAuthor', () => {
  it('пишет задание из ответа модели и называет ей проект, коннекторы и просьбу', async () => {
    const ask = vi.fn<TaskAuthorHost['ask']>(() => Promise.resolve({ output: OUTPUT }))
    const outcome = await new TaskAuthor(host(ask)).write('/work/acme', 'a1', 'Каждое утро почта')

    expect(outcome).toMatchObject({ ok: true, task: { name: 'Inbox digest', kind: 'schedule' } })

    const prompt = ask.mock.calls[0]?.[0] ?? ''

    expect(prompt).toContain('Project: acme (/work/acme)')
    expect(prompt).toContain('- Gmail mailbox (gmail-work): Work mail')
    expect(prompt).toContain('<request>\nКаждое утро почта\n</request>')
  })

  it('ответ не по форме - unreadable, отказ провайдера - его кодом и словами', async () => {
    const unreadable = new TaskAuthor(host(() => Promise.resolve({ output: { name: '' } })))
    const failed = new TaskAuthor(
      host(() => Promise.resolve({ failure: 'failed', detail: 'Rate limited' })),
    )

    expect(await unreadable.write('/p', 'a1', 'x')).toEqual({
      ok: false,
      cancelled: false,
      error: 'unreadable',
      detail: '',
    })
    expect(await failed.write('/p', 'a2', 'x')).toEqual({
      ok: false,
      cancelled: false,
      error: 'failed',
      detail: 'Rate limited',
    })
  })

  it('отмена по номеру запроса гасит вопрос, и итог - отменённый', async () => {
    const seen: { signal: AbortSignal | null } = { signal: null }
    const author = new TaskAuthor(
      host(
        (_prompt, _schema, signal) =>
          new Promise<AuthorAnswer>((resolve) => {
            seen.signal = signal
            signal.addEventListener('abort', () => resolve({ failure: 'cancelled', detail: '' }))
          }),
      ),
    )
    const pending = author.write('/p', 'a1', 'x')

    author.cancel('a1')

    expect(await pending).toEqual({ ok: false, cancelled: true })
    expect(seen.signal?.aborted).toBe(true)
  })
})
