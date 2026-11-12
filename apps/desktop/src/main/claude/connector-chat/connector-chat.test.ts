import { it, vi, expect, describe, afterEach } from 'vitest'

import type { FeedPatch } from '@shared/claude-feed'

import type { CliMessage } from '../cli/cli-messages'
import type { AiChatEvents } from '../../connectors/ai/ai-chat'
import type { SessionProcess } from '../../scenarios/engine/scenario-session'
import { ConnectorChat } from './connector-chat'
import type { ChatWires } from './connector-chat'
import { CHAT_REST_MS } from './connector-chat.constants'

/** Подделка процесса CLI: помнит, что ему писали, а строки потока тест шлёт сам. */
class FakeProcess implements SessionProcess {
  isAlive = true
  readonly written: CliMessage[] = []
  readonly controls: Record<string, unknown>[] = []

  constructor(
    readonly resume: boolean,
    readonly wires: ChatWires,
  ) {}

  write(message: object): void {
    this.written.push(message as CliMessage)
  }

  control(request: Record<string, unknown>): Promise<unknown> {
    this.controls.push(request)

    return Promise.resolve({})
  }

  respond(): void {}

  stop(): Promise<void> {
    this.isAlive = false

    return Promise.resolve()
  }

  emit(message: CliMessage): void {
    this.wires.onMessage(message)
  }
}

const init: CliMessage = { type: 'system', subtype: 'init', session_id: 's' }

const searching: CliMessage = {
  type: 'assistant',
  message: {
    id: 'msg_1',
    role: 'assistant',
    content: [
      { type: 'tool_use', id: 'toolu_1', name: 'WebSearch', input: { query: 'Linear API' } },
    ],
  },
  parent_tool_use_id: null,
}

const answered = (output: unknown): CliMessage => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 3,
  result: JSON.stringify(output),
  structured_output: output,
})

const setup = (resume = false) => {
  const processes: FakeProcess[] = []
  const patches: FeedPatch[] = []
  const events = {
    onFeed: (patch: FeedPatch) => patches.push(patch),
    onTurnStarted: vi.fn<AiChatEvents['onTurnStarted']>(),
    onSaved: vi.fn<AiChatEvents['onSaved']>(),
    onActivity: vi.fn<AiChatEvents['onActivity']>(),
    onTurnEnded: vi.fn<AiChatEvents['onTurnEnded']>(),
  }
  const chat = new ConnectorChat(
    { sessionId: 's', resume, instructions: 'rules', schema: { type: 'object' } },
    {
      spawn: (again, wires) => {
        const process = new FakeProcess(again, wires)

        processes.push(process)

        return process
      },
      load: () => Promise.resolve(),
      thumbnail: () => '',
      forget: () => Promise.resolve(),
    },
    events,
  )

  const writes = () => processes.reduce((sum, process) => sum + process.written.length, 0)

  /** Сказать и дождаться, пока слова дойдут до процесса. */
  const tell = async (text: string) => {
    const before = writes()

    chat.tell(text)
    await vi.waitFor(() => expect(writes()).toBeGreaterThan(before))
  }

  return { chat, processes, patches, events, tell }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ConnectorChat', () => {
  it('слова человека - в ленту и в процесс одним uuid, ответ хода - по схеме', async () => {
    const { processes, patches, events, tell } = setup()

    await tell('Service: Linear')

    const process = processes[0]
    const written = process?.written[0]

    expect(process?.resume).toBe(false)
    expect(written?.type).toBe('user')

    process?.emit(init)
    process?.emit(searching)
    process?.emit(answered({ outcome: 'none', message: 'Hi' }))

    expect(events.onActivity).toHaveBeenCalledWith({ kind: 'search', subject: 'Linear API' })
    expect(events.onTurnEnded).toHaveBeenCalledWith({
      kind: 'answer',
      output: { outcome: 'none', message: 'Hi' },
    })

    const user = patches.flatMap((patch) => patch.upserts).find((item) => item.kind === 'user')

    expect(user).toMatchObject({ id: written?.['uuid'], text: 'Service: Linear' })
  })

  it('после хода процесс засыпает, следующее слово поднимает его поверх разговора', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { processes, tell } = setup()

    await tell('first')
    processes[0]?.emit(init)
    processes[0]?.emit(answered({ outcome: 'none', message: '' }))
    vi.advanceTimersByTime(CHAT_REST_MS + 1)

    expect(processes[0]?.isAlive).toBe(false)

    await tell('second')

    expect(processes).toHaveLength(2)
    expect(processes[1]?.resume).toBe(true)
  })

  it('процесс, который не заговорил, разговора не завёл: следующий - снова новый', async () => {
    const { processes, events, tell } = setup()

    await tell('go')
    processes[0]?.wires.onExit(1, 'boom')
    await tell('again')

    expect(processes[1]?.resume).toBe(false)
    expect(events.onSaved).not.toHaveBeenCalled()
  })

  it('пустой итог свежего процесса после --resume - рукопожатие, а не конец хода', async () => {
    const { processes, events, tell } = setup(true)

    await tell('go on')
    processes[0]?.emit({ type: 'result', subtype: 'success', num_turns: 0, result: '' })

    expect(events.onTurnEnded).not.toHaveBeenCalled()

    processes[0]?.emit(answered({ outcome: 'none', message: 'ok' }))

    expect(events.onTurnEnded).toHaveBeenCalledOnce()
    expect(processes[0]?.resume).toBe(true)
  })

  it('Stop - прерывание хода, его конец - остановка, хоть CLI и пишет ошибку', async () => {
    const { chat, processes, events, tell } = setup()

    await tell('go')
    processes[0]?.emit(init)
    chat.stop()

    expect(processes[0]?.controls).toEqual([{ subtype: 'interrupt' }])

    processes[0]?.emit({ type: 'result', subtype: 'error_during_execution', is_error: true })

    expect(events.onTurnEnded).toHaveBeenCalledWith({ kind: 'stopped' })
  })

  it('Stop, пока слова ещё в пути, останавливает ход, который они начнут', async () => {
    const { chat, processes } = setup()

    chat.tell('go')
    chat.stop()
    await vi.waitFor(() => expect(processes[0]?.controls).toEqual([{ subtype: 'interrupt' }]))

    expect(processes[0]?.written[0]?.type).toBe('user')
  })

  it('процесс ушёл посреди хода - сбой с последней строкой stderr; CLI нет - cli-missing', async () => {
    const crashed = setup()

    await crashed.tell('go')
    crashed.processes[0]?.wires.onExit(1, 'warming up\nAPI Error: overloaded\n')

    expect(crashed.events.onTurnEnded).toHaveBeenCalledWith({
      kind: 'failed',
      error: 'failed',
      detail: 'API Error: overloaded',
    })

    const missing = setup()

    await missing.tell('go')
    missing.processes[0]?.wires.onMissing()
    missing.processes[0]?.wires.onExit(null, 'Claude Code could not start.')

    expect(missing.events.onTurnEnded).toHaveBeenCalledWith({
      kind: 'failed',
      error: 'cli-missing',
      detail: '',
    })
  })

  it('ход, начатый самим CLI (слова не успели в прошлый), - событием', async () => {
    const { processes, events, tell } = setup()

    await tell('first')
    processes[0]?.emit(init)
    processes[0]?.emit(answered({ outcome: 'none', message: '' }))
    processes[0]?.emit(init)

    expect(events.onTurnStarted).toHaveBeenCalledOnce()
    expect(events.onSaved).toHaveBeenCalledOnce()
  })

  it('на вопрос CLI - отказ: спросить некого, без ответа ход повис бы', async () => {
    const { processes, tell } = setup()

    await tell('go')
    processes[0]?.wires.onControlRequest({
      type: 'control_request',
      request_id: 'r1',
      request: { subtype: 'can_use_tool', tool_name: 'Bash' },
    })

    expect(processes[0]?.written.at(-1)).toEqual({
      type: 'control_response',
      response: { subtype: 'error', request_id: 'r1', error: 'Unsupported request' },
    })
  })
})
