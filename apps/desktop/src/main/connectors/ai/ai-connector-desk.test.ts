import { it, vi, expect, describe, afterEach } from 'vitest'

import type { ImportCandidate } from '@shared/connectors'

import type { JsonFile } from '../../storage/json-file'
import type { AiChat, AiChatEvents, AiChatOptions } from './ai-chat'
import { AiConnectorDesk } from './ai-connector-desk'
import { STOP_GRACE_MS, TURN_TIMEOUT_MS } from './ai-connector.constants'
import type { StoredAiJobs } from './ai-jobs-file'

/** Разговор-подделка: помнит слова и остановки, конец хода тест шлёт сам. */
class FakeChat implements AiChat {
  readonly told: string[] = []
  stops = 0
  disposed = false

  constructor(
    readonly options: AiChatOptions,
    readonly events: AiChatEvents,
  ) {}

  tell(text: string): void {
    this.told.push(text)
  }

  stop(): void {
    this.stops += 1
  }

  feed() {
    return Promise.resolve({ conversationId: 's', items: [], tasks: [], hasEarlier: false })
  }

  dispose(): void {
    this.disposed = true
  }
}

const callmate: ImportCandidate = {
  key: 'user:callmate',
  name: 'callmate',
  serverName: 'callmate',
  kind: 'mcp',
  target: 'https://callmate.mzpizote.com/api/mcp',
  scope: 'user',
  projectPath: null,
  needsSignIn: false,
  blocked: null,
  pending: false,
}

const request = { service: 'Callmate', goal: 'Read my calls', docsUrl: '' }

const setup = (stored: StoredAiJobs | null = null) => {
  const chats: FakeChat[] = []
  const written: StoredAiJobs[] = []
  const file = {
    read: () => Promise.resolve(stored),
    write: (value: StoredAiJobs) => {
      written.push(value)

      return Promise.resolve()
    },
  } as unknown as JsonFile<StoredAiJobs>
  const desk = new AiConnectorDesk({
    open: (options, events) => {
      const chat = new FakeChat(options, events)

      chats.push(chat)

      return chat
    },
    file,
    candidates: () => Promise.resolve([callmate]),
    changed: () => undefined,
    onFeed: () => undefined,
  })

  /** Первая работа и её разговор, когда первое слово уже ушло. */
  const started = async () => {
    desk.start(request)
    await vi.waitFor(() => expect(chats.at(-1)?.told.length).toBeGreaterThan(0))

    const chat = chats.at(-1) as FakeChat

    return { chat, job: () => desk.list[0] }
  }

  return { desk, chats, written, started }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AiConnectorDesk', () => {
  it('новая работа: просьба человека - первым словом, серверы Claude Code - в правилах', async () => {
    const { started } = setup()
    const { chat, job } = await started()

    expect(job()?.status).toBe('working')
    expect(chat.told[0]).toBe('Service: Callmate\nWhat it should do: Read my calls')
    expect(chat.options.resume).toBe(false)
    expect(chat.options.instructions).toContain(
      '- callmate: remote MCP server at https://callmate.mzpizote.com/api/mcp, all projects',
    )
    expect(chat.options.schema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
    })
  })

  it('свой продукт человека - сервер из Claude Code: предложение перенести его', async () => {
    const { started } = setup()
    const { chat, job } = await started()

    chat.events.onTurnEnded({
      kind: 'answer',
      output: { outcome: 'existing', message: 'It is already set up', existing: 'Callmate' },
    })

    expect(job()).toMatchObject({
      status: 'ready',
      message: 'It is already set up',
      proposal: { kind: 'existing', candidate: callmate },
    })
  })

  it('вопрос ИИ - ждёт человека, а прежнее предложение остаётся', async () => {
    const { started } = setup()
    const { chat, job } = await started()
    const mcp = { url: 'https://mcp.linear.app/mcp', auth: 'oauth' }

    chat.events.onTurnEnded({ kind: 'answer', output: { outcome: 'mcp', message: 'MCP', mcp } })
    chat.events.onTurnEnded({ kind: 'answer', output: { outcome: 'none', message: 'Which one?' } })

    expect(job()).toMatchObject({
      status: 'asking',
      message: 'Which one?',
      proposal: { kind: 'mcp', ...mcp },
    })
  })

  it('негодное предложение - invalid с пояснением; слова человека снимают ошибку', async () => {
    const { desk, started } = setup()
    const { chat, job } = await started()
    const id = job()?.id ?? ''

    chat.events.onTurnEnded({
      kind: 'answer',
      output: { outcome: 'mcp', message: 'Here', mcp: { url: 'http://mcp.example.com' } },
    })

    expect(job()).toMatchObject({ status: 'failed', error: 'invalid', message: 'Here' })
    expect(job()?.detail).not.toBe('')

    desk.tell(id, 'Try again')
    await vi.waitFor(() => expect(chat.told).toContain('Try again'))

    expect(job()).toMatchObject({ status: 'working', error: null, detail: '' })
  })

  it('шаг хода виден только в работе; конец хода его снимает', async () => {
    const { started } = setup()
    const { chat, job } = await started()

    chat.events.onActivity({ kind: 'read', subject: 'https://docs.example.com' })

    expect(job()?.activity).toEqual({ kind: 'read', subject: 'https://docs.example.com' })

    chat.events.onTurnEnded({ kind: 'stopped' })

    expect(job()).toMatchObject({ status: 'stopped', activity: null })
  })

  it('ход не уложился в срок - остановка, а не ответивший процесс гасится', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { started } = setup()
    const { chat, job } = await started()

    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS)

    expect(chat.stops).toBe(1)

    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS)

    expect(chat.disposed).toBe(true)
    expect(job()).toMatchObject({ status: 'failed', error: 'timeout' })
  })

  it('работа на диске: ход при выходе - остановлен, продолжение - поверх разговора', async () => {
    const { started, written } = setup()
    const { chat } = await started()

    chat.events.onSaved()
    await vi.waitFor(() => expect(written.at(-1)?.jobs[0]?.saved).toBe(true))

    const restored = setup(written.at(-1) ?? null)

    await restored.desk.load()

    const job = restored.desk.list[0]

    expect(job).toMatchObject({ status: 'stopped', request })

    restored.desk.tell(job?.id ?? '', 'Continue')
    await vi.waitFor(() => expect(restored.chats[0]?.told).toEqual(['Continue']))

    expect(restored.chats[0]?.options).toMatchObject({
      sessionId: chat.options.sessionId,
      resume: true,
    })
  })

  it('убранная работа гасит разговор и уходит с диска', async () => {
    const { desk, written, started } = setup()
    const { chat, job } = await started()

    desk.remove(job()?.id ?? '')
    await vi.waitFor(() => expect(chat.disposed).toBe(true))

    expect(desk.list).toEqual([])
    await vi.waitFor(() => expect(written.at(-1)).toEqual({ jobs: [] }))
  })
})
