import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import { freshConversation } from '../claude-state'
import type { CliProcess } from '../cli/cli-process'
import type { ConversationHost } from './conversation-runtime'
import { ConversationRuntime } from './conversation-runtime'
import { REWOUND_DENY, IDLE_SLEEP_MS, COMMAND_RESULT_GRACE_MS } from './conversation.constants'
import { PLAN_ANSWERED_IN_CHAT } from './pending-requests'
import { rewind } from './rewind'
import { spawnConversationProcess } from './spawn'

vi.mock('./spawn', () => ({ spawnConversationProcess: vi.fn() }))

type Block = { type: string; text?: string }
type Written = { type: string; uuid?: string; message?: { content: Block[] } }

/** Процесс CLI без процесса: запоминает, что ему написали, гасится по команде теста. */
const fakeProcess = () => {
  const state = { alive: true, stopping: false }
  const fake = {
    texts: [] as string[],
    uuids: [] as string[],
    imageCounts: [] as number[],
    answers: [] as unknown[],
    /** Ответы на управляющие запросы по subtype; нет - пустой ответ. */
    replies: {} as Record<string, unknown>,
    write: vi.fn((message: Written) => {
      if (message.type !== 'user') return

      const content = message.message?.content ?? []

      fake.texts.push(content.find((block) => block.type === 'text')?.text ?? '')
      fake.imageCounts.push(content.filter((block) => block.type === 'image').length)
      fake.uuids.push(message.uuid ?? '')
    }),
    respond: vi.fn((_id: string, answer: unknown) => fake.answers.push(answer)),
    control: vi.fn((request: { subtype: string }) =>
      Promise.resolve(fake.replies[request.subtype] ?? {}),
    ),
    stop: vi.fn(() => {
      state.alive = false

      return Promise.resolve()
    }),
    kill: vi.fn(() => {
      state.stopping = true
    }),
    get isAlive() {
      return state.alive && !state.stopping
    },
    get isStopping() {
      return state.stopping && state.alive
    },
  }

  return fake
}

type FakeProcess = ReturnType<typeof fakeProcess>

const makeRuntime = (trusted: { value: boolean }) => {
  const host: ConversationHost = {
    cli: () =>
      Promise.resolve({
        binary: 'claude',
        env: {},
        features: {
          manualMode: true,
          allowSkipPermissions: true,
          safeMode: true,
        },
      }),
    isTrusted: () => Promise.resolve(trusted.value),
    onChange: () => undefined,
    onFeedPatch: () => undefined,
    onCommands: () => undefined,
    onModels: () => undefined,
    knownCommands: () => [],
    thumbnail: () => '',
    accountId: () => '',
    onUsageHint: () => undefined,
    onCall: () => undefined,
    mcpConfig: () => Promise.resolve(null),
  }
  const runtime = new ConversationRuntime(
    freshConversation({
      id: 'c1',
      projectPath: '/p',
      sessionId: 's1',
      title: '',
      model: null,
      effort: null,
      permissionMode: 'default',
      queue: [],
      fork: null,
      updatedAt: 0,
    }),
    host,
  )

  // Транскрипта нет: лента не читает диск и не спрашивает login shell.
  vi.spyOn(runtime.feed, 'ensureLoaded').mockResolvedValue()

  return runtime
}

/** Следующий поднятый процесс - этот. */
const nextProcess = (fake: FakeProcess) =>
  vi.mocked(spawnConversationProcess).mockResolvedValueOnce(fake as unknown as CliProcess)

const askPermission = (
  runtime: ConversationRuntime,
  fake: FakeProcess,
  id: string,
  tool: { name: string; input: Record<string, unknown> } = {
    name: 'Bash',
    input: { command: 'ls' },
  },
) =>
  runtime.handleControlRequest(fake as unknown as CliProcess, {
    type: 'control_request',
    request_id: id,
    request: {
      subtype: 'can_use_tool',
      tool_use_id: `tool-${id}`,
      tool_name: tool.name,
      input: tool.input,
    },
  })

/** Строка потока CLI - как её получил бы разговор от живого процесса. */
const receive = (runtime: ConversationRuntime, fake: FakeProcess, message: object) =>
  runtime.handleMessage(fake as unknown as CliProcess, message as never)

/** Ход кончился так, как его заканчивает process-router. */
const finishTurn = (runtime: ConversationRuntime, isClean = true) => {
  runtime.turnActive = false
  runtime.syncStatus()
  runtime.afterTurn(isClean)
}

/**
 * Настоящая запись CLI 2.1.293: /compact первым сообщением процесса, поднятого с --resume
 * (статус, init после сжатия, граница, итог без шагов и отметки команды). command - uuid
 * нашего сообщения, его CLI повторяет в отметках и итоге.
 */
const compactLines = (command: string): object[] =>
  readFileSync(join(import.meta.dirname, '__fixtures__/compact-fresh.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line.replaceAll('{{command}}', command)) as object)

/** Отметка CLI о команде. */
const lifecycle = (command: string, state: string) => ({
  type: 'command_lifecycle',
  command_uuid: command,
  state,
})

/** Сообщение без картинок. */
const msg = (text: string) => ({ text, images: [] })

const queueTexts = (runtime: ConversationRuntime) => runtime.meta.queue.map((item) => item.text)

beforeEach(() => vi.mocked(spawnConversationProcess).mockReset())

afterEach(() => vi.useRealTimers())

describe('разговор, который не может начаться', () => {
  it('сообщения не пропадают: ждут в очереди по порядку, разговор не висит в работе', async () => {
    const runtime = makeRuntime({ value: false })

    await runtime.send(msg('first'))
    await runtime.send(msg('second'))

    expect(runtime.meta.error).toBe('untrusted')
    expect(runtime.meta.status).toBe('idle')
    expect(queueTexts(runtime)).toEqual(['first', 'second'])
  })

  it('снятая причина отправляет ждавшее; не вышло снова - сообщения не двоятся', async () => {
    const runtime = makeRuntime({ value: false })

    await runtime.send(msg('first'))
    await runtime.send(msg('second'))
    await runtime.resolveError('untrusted')

    expect(runtime.meta.error).toBe('untrusted')
    expect(queueTexts(runtime)).toEqual(['first', 'second'])
  })

  it('причину сняли в обход панели - ждавшее уходит первым, новое за ним, по разу', async () => {
    const trusted = { value: false }
    const runtime = makeRuntime(trusted)
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('A'))
    trusted.value = true
    await runtime.send(msg('B'))

    expect(fake.texts).toEqual(['A'])
    expect(queueTexts(runtime)).toEqual(['B'])

    finishTurn(runtime)
    await vi.waitFor(() => expect(fake.texts).toEqual(['A', 'B']))
    expect(runtime.meta.queue).toEqual([])
  })

  it('чужая причина ничего не снимает', async () => {
    const runtime = makeRuntime({ value: false })

    await runtime.send(msg('hello'))
    await runtime.resolveError('cli-not-found')

    expect(runtime.meta.error).toBe('untrusted')
  })
})

describe('очередь и вопросы', () => {
  it('очередь не отвечает за человека на вопрос фонового субагента', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))
    askPermission(runtime, fake, 'r1')
    await runtime.enqueue(msg('later'))
    finishTurn(runtime)

    expect(fake.answers).toEqual([])
    expect(queueTexts(runtime)).toEqual(['later'])

    runtime.respond('r1', { kind: 'permission', decision: { behavior: 'allow' } })

    await vi.waitFor(() => expect(fake.texts).toEqual(['hello', 'later']))
    expect(fake.answers).toHaveLength(1)
  })

  it('команда при висящем вопросе ждёт в очереди и не снимает вопрос', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))
    askPermission(runtime, fake, 'r1')
    await runtime.send(msg('/compact'))

    expect(fake.answers).toEqual([])
    expect(runtime.meta.pending).not.toBeNull()
    expect(queueTexts(runtime)).toEqual(['/compact'])
  })

  it('«отправить сейчас» для команды посреди хода оставляет её первой', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))
    await runtime.enqueue(msg('/compact'))
    await runtime.enqueue(msg('task'))

    const [command] = runtime.meta.queue

    await runtime.sendQueued(command?.id ?? '')

    expect(queueTexts(runtime)).toEqual(['/compact', 'task'])
  })
})

describe('процесс', () => {
  it('сообщение после «погасить» ждёт конца старого процесса и уходит в новый', async () => {
    const runtime = makeRuntime({ value: true })
    const first = fakeProcess()
    const second = fakeProcess()

    nextProcess(first).mockResolvedValueOnce(second as unknown as CliProcess)
    await runtime.send(msg('hello'))
    first.stop.mockImplementationOnce(() => {
      runtime.handleExit(first as unknown as CliProcess, null, '')

      return Promise.resolve()
    })
    runtime.forceStop()
    await runtime.send(msg('again'))

    expect(first.texts).toEqual(['hello'])
    expect(second.texts).toEqual(['again'])
  })

  it('очередь, которая ждёт человека после остановки, не мешает процессу уснуть', async () => {
    vi.useFakeTimers()

    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))
    await runtime.enqueue(msg('later'))
    finishTurn(runtime, false)
    await vi.advanceTimersByTimeAsync(IDLE_SLEEP_MS + 1)

    expect(fake.stop).toHaveBeenCalled()
    expect(queueTexts(runtime)).toEqual(['later'])
  })

  it('процесс не засыпает посреди workflow: флот работает после конца хода', async () => {
    vi.useFakeTimers()

    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('review'))
    receive(runtime, fake, {
      type: 'assistant',
      message: { id: 'm1', content: [{ type: 'tool_use', id: 'w1', name: 'Workflow', input: {} }] },
    })
    receive(runtime, fake, {
      type: 'system',
      subtype: 'task_started',
      task_id: 'wf-1',
      tool_use_id: 'w1',
      task_type: 'local_workflow',
    })
    receive(runtime, fake, {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'w1', content: 'Workflow launched in background.' },
        ],
      },
    })
    finishTurn(runtime)
    await vi.advanceTimersByTimeAsync(IDLE_SLEEP_MS * 2)

    expect(fake.stop).not.toHaveBeenCalled()

    receive(runtime, fake, {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'wf-1',
      status: 'completed',
    })
    await vi.advanceTimersByTimeAsync(IDLE_SLEEP_MS + 1)

    expect(fake.stop).toHaveBeenCalled()
  })
})

describe('откат', () => {
  it('висящий вопрос субагента получает отказ, а не ждёт вечно', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))
    finishTurn(runtime)
    askPermission(runtime, fake, 'r1')
    fake.replies['rewind_conversation'] = { rewound: true }

    const outcome = await rewind(runtime, fake.uuids[0] ?? '', 'conversation')

    expect(outcome).toMatchObject({ rewound: true })
    expect(fake.answers).toEqual([{ behavior: 'deny', message: REWOUND_DENY }])
    expect(runtime.meta.status).toBe('idle')
  })

  it('ход, который CLI начал сам после отката идущего хода, доходит до конца', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))
    fake.replies['rewind_conversation'] = { rewound: true }
    await rewind(runtime, fake.uuids[0] ?? '', 'conversation')
    // Поздний итог отрезанного хода - лишний.
    receive(runtime, fake, { type: 'result', num_turns: 1, result: 'cut', total_cost_usd: 0 })
    // Фоновый агент кончился, CLI начал новый ход сам.
    receive(runtime, fake, { type: 'system', subtype: 'init', session_id: 's1' })

    expect(runtime.meta.status).toBe('running')

    receive(runtime, fake, { type: 'result', num_turns: 1, result: 'done', total_cost_usd: 0 })

    expect(runtime.meta.status).toBe('idle')
  })
})

describe('отложенный перезапуск', () => {
  it('ответ на последний вопрос освобождает разговор - следующий ход идёт в новый процесс', async () => {
    const runtime = makeRuntime({ value: true })
    const first = fakeProcess()
    const second = fakeProcess()

    nextProcess(first).mockResolvedValueOnce(second as unknown as CliProcess)
    await runtime.send(msg('hello'))
    askPermission(runtime, first, 'r1')
    finishTurn(runtime)
    runtime.restartProcess()

    expect(first.stop).not.toHaveBeenCalled()

    runtime.respond('r1', { kind: 'permission', decision: { behavior: 'allow' } })
    await runtime.send(msg('next'))

    expect(first.stop).toHaveBeenCalled()
    expect(second.texts).toEqual(['next'])
  })

  it('процесс, который гасится, доживает до конца, прежде чем экран MCP поднимет новый', async () => {
    const runtime = makeRuntime({ value: true })
    const first = fakeProcess()
    const second = fakeProcess()

    nextProcess(first).mockResolvedValueOnce(second as unknown as CliProcess)
    await runtime.send(msg('hello'))
    first.stop.mockImplementationOnce(() => {
      runtime.handleExit(first as unknown as CliProcess, null, '')

      return Promise.resolve()
    })
    runtime.forceStop()
    await runtime.prepareProcess()

    expect(runtime.meta.status).toBe('idle')
    expect(runtime.process).toBe(second)
  })
})

describe('сообщение', () => {
  it('замечание к плану с картинкой уходит сообщением, отказ отсылает к нему', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('plan it'))
    askPermission(runtime, fake, 'p1', { name: 'ExitPlanMode', input: { plan: 'Step 1' } })
    await runtime.send({ text: 'like this', images: [{ mediaType: 'image/png', data: 'AAAA' }] })

    expect(fake.texts).toEqual(['plan it', 'like this'])
    expect(fake.imageCounts).toEqual([0, 1])
    expect(fake.answers).toEqual([{ behavior: 'deny', message: PLAN_ANSWERED_IN_CHAT }])
  })

  it('команда «/» не забирает вывод «!»: он едет с ближайшим обычным сообщением', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()
    const takeContext = vi
      .spyOn(runtime.shells, 'takeContext')
      .mockReturnValue('<bash-input>ls</bash-input>')

    nextProcess(fake)
    await runtime.send(msg('/compact'))

    expect(fake.texts).toEqual(['/compact'])
    expect(takeContext).not.toHaveBeenCalled()

    finishTurn(runtime)
    await runtime.send(msg('what now'))

    expect(fake.texts[1]).toBe('<bash-input>ls</bash-input>\n\nwhat now')
  })
})

describe('контекст разговора', () => {
  it('окно известно с начала первого хода, а не с его конца', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    fake.replies['get_context_usage'] = { totalTokens: 41_000, maxTokens: 1_000_000 }
    nextProcess(fake)
    await runtime.send(msg('build a game'))
    receive(runtime, fake, { type: 'system', subtype: 'init', session_id: 's1' })

    expect(fake.control).toHaveBeenCalledWith({ subtype: 'get_context_usage' })
    await vi.waitFor(() =>
      expect(runtime.meta.usage).toMatchObject({ contextTokens: 41_000, contextWindow: 1_000_000 }),
    )

    // Дальше по ходу занятое растёт по ответам модели, окно остаётся.
    receive(runtime, fake, {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        model: 'claude-opus-5-5',
        usage: { input_tokens: 5, cache_read_input_tokens: 90_000 },
      },
    })

    expect(runtime.meta.usage).toMatchObject({ contextTokens: 90_005, contextWindow: 1_000_000 })
  })

  it('окно в итоге хода - модели разговора, а не субагента с окном пошире', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('build a game'))
    receive(runtime, fake, {
      type: 'system',
      subtype: 'init',
      session_id: 's1',
      model: 'main-model',
    })
    receive(runtime, fake, {
      type: 'result',
      num_turns: 1,
      result: 'done',
      total_cost_usd: 0,
      usage: { iterations: [{ input_tokens: 10, cache_read_input_tokens: 20_000 }] },
      modelUsage: {
        'main-model': { contextWindow: 200_000 },
        'agent-model': { contextWindow: 1_000_000 },
      },
    })

    expect(runtime.meta.usage).toMatchObject({ contextTokens: 20_010, contextWindow: 200_000 })
  })
})

describe('конец хода', () => {
  it('/compact первым сообщением свежего процесса заканчивает ход, и очередь уходит', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('/compact'))
    await runtime.enqueue(msg('next'))

    for (const line of compactLines(fake.uuids[0] ?? '')) receive(runtime, fake, line)

    expect(runtime.meta.status).toBe('idle')
    expect(runtime.meta.stopRequestedAt).toBeNull()
    expect(runtime.feed.builder.items.at(-1)).toMatchObject({ kind: 'turn', costUsd: 0.01004223 })
    await vi.waitFor(() => expect(fake.texts).toEqual(['/compact', 'next']))
  })

  it('/compact кончает ход и без отметок CLI - по имени команды и uuid в итоге', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('/compact'))

    const lines = compactLines(fake.uuids[0] ?? '').filter(
      (line) => (line as { type: string }).type !== 'command_lifecycle',
    )

    for (const line of lines) receive(runtime, fake, line)

    expect(runtime.meta.status).toBe('idle')
  })

  it('пустой итог свежего процесса без нашего сообщения - рукопожатие, ход идёт', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))
    receive(runtime, fake, { type: 'result', num_turns: 0, result: '', is_error: false })

    expect(runtime.meta.status).toBe('running')

    receive(runtime, fake, { type: 'result', num_turns: 1, result: 'hi', total_cost_usd: 0 })

    expect(runtime.meta.status).toBe('idle')
  })

  it('команда хода кончилась, а итога нет - ход закрывается без него', async () => {
    vi.useFakeTimers()

    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))

    const command = fake.uuids[0] ?? ''

    receive(runtime, fake, lifecycle(command, 'started'))
    receive(runtime, fake, lifecycle(command, 'completed'))

    expect(runtime.meta.status).toBe('running')

    await vi.advanceTimersByTimeAsync(COMMAND_RESULT_GRACE_MS + 1)

    expect(runtime.meta.status).toBe('idle')
  })

  it('итог перед отметкой закрывает ход один раз: отметка после него ничего не трогает', async () => {
    vi.useFakeTimers()

    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('hello'))

    const command = fake.uuids[0] ?? ''

    receive(runtime, fake, { type: 'result', num_turns: 1, result: 'hi', total_cost_usd: 0 })
    receive(runtime, fake, lifecycle(command, 'completed'))
    await runtime.send(msg('again'))
    await vi.advanceTimersByTimeAsync(COMMAND_RESULT_GRACE_MS + 1)

    // Отметка прошлого хода не закрывает новый.
    expect(runtime.meta.status).toBe('running')
  })

  it('сообщение посреди хода, кончившись, ход не закрывает', async () => {
    vi.useFakeTimers()

    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('first'))
    await runtime.send(msg('and also this'))
    receive(runtime, fake, lifecycle(fake.uuids[1] ?? '', 'completed'))
    await vi.advanceTimersByTimeAsync(COMMAND_RESULT_GRACE_MS + 1)

    expect(fake.texts).toEqual(['first', 'and also this'])
    expect(runtime.meta.status).toBe('running')
  })

  it('процесс, умерший посреди /compact, - вышел, а не «не поднялся»', async () => {
    const runtime = makeRuntime({ value: true })
    const fake = fakeProcess()

    nextProcess(fake)
    await runtime.send(msg('/compact'))
    receive(runtime, fake, lifecycle(fake.uuids[0] ?? '', 'started'))
    runtime.handleExit(fake as unknown as CliProcess, 1, 'boom')

    expect(runtime.feed.builder.items.at(-1)).toMatchObject({
      kind: 'notice',
      code: 'process-exited',
    })
  })
})

describe('процесс не поднялся', () => {
  it('сбой подготовки - сообщение ждёт в очереди, ход не висит, причина во вкладке', async () => {
    const runtime = makeRuntime({ value: true })

    vi.mocked(spawnConversationProcess).mockRejectedValueOnce(new Error('ENOSPC'))
    await runtime.send(msg('hello'))

    expect(runtime.turnActive).toBe(false)
    expect(runtime.meta.queue.map((item) => item.text)).toEqual(['hello'])
    expect(runtime.meta.error).toBe('start-failed')
  })
})
