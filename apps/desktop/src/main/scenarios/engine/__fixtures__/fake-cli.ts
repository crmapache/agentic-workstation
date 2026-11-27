import type { SessionSpec, SessionWires, SessionProcess } from '../scenario-session'
import type { CliMessage } from '../../../claude/cli/cli-messages'

/**
 * Что подделка отвечает на сообщение: текст хода, вопрос разрешения или ничего (молчит). after -
 * сначала дождаться работы (вызов инструмента IDE посреди хода), потом сказать текст.
 */
export type FakeReply =
  | { kind: 'say'; text: string; cost?: number }
  | { kind: 'after'; work: () => Promise<unknown>; text: string; cost?: number }
  | { kind: 'fail'; text: string }
  | { kind: 'ask'; tool: string; input: Record<string, unknown>; then: string }
  | { kind: 'refuseLimit' }
  | { kind: 'silent' }

export type FakeScript = (said: string, spec: SessionSpec) => FakeReply

/** Подождать, пока отыграют все отложенные ответы подделки. */
export const settle = async (rounds = 40): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

/**
 * Подделка процесса CLI для тестов движка: на сообщение человека - ход потоком stream-json
 * (init, assistant, дельта с end_turn, result), на вопрос разрешения - ждёт ответа. Настоящих
 * прогонов с моделью тесты не запускают: они тратят лимит владельца.
 */
export class FakeCli implements SessionProcess {
  isAlive = true
  readonly heard: string[] = []
  readonly answers: { requestId: string; response: Record<string, unknown> }[] = []
  private turns = 0
  private cost = 0
  private waiting: { requestId: string; then: string } | null = null
  private asked = 0

  constructor(
    readonly spec: SessionSpec,
    private readonly wires: SessionWires,
    private readonly script: FakeScript,
  ) {}

  write(message: object): void {
    const record = message as CliMessage

    if (record.type !== 'user') return

    const content =
      (record['message'] as { content?: { type: string; text?: string }[] })?.content ?? []
    const said = content.map((block) => block.text ?? '').join('\n')

    this.heard.push(said)
    setImmediate(() => this.react(said))
  }

  control(request: Record<string, unknown>): Promise<unknown> {
    if (request['subtype'] === 'interrupt' && this.isAlive && !this.waiting) {
      setImmediate(() =>
        this.emit({
          type: 'result',
          subtype: 'error_during_execution',
          result: '',
          is_error: true,
          num_turns: 1,
        }),
      )
    }

    return Promise.resolve({})
  }

  respond(requestId: string, response: Record<string, unknown>): void {
    this.answers.push({ requestId, response })

    if (this.waiting?.requestId !== requestId) return

    const { then } = this.waiting

    this.waiting = null
    setImmediate(() => this.finish(then))
  }

  stop(): Promise<void> {
    this.isAlive = false

    return Promise.resolve()
  }

  /** Строка посреди хода - вызов инструмента: процесс работает, ход ещё не кончен. */
  pulse(): void {
    this.emit({
      type: 'assistant',
      message: {
        id: `work-${this.turns}`,
        content: [{ type: 'tool_use', name: 'Bash', input: {} }],
      },
    })
  }

  /** Процесс умер сам. */
  crash(): void {
    this.isAlive = false
    this.wires.onExit(1, 'boom')
  }

  private emit(message: CliMessage) {
    if (this.isAlive) this.wires.onMessage(message)
  }

  private react(said: string) {
    const reply = this.script(said, this.spec)

    if (reply.kind === 'silent') return

    this.turns += 1
    this.emit({ type: 'system', subtype: 'init', session_id: this.spec.sessionId })

    if (reply.kind === 'refuseLimit') {
      this.emit({ type: 'assistant', error: 'rate_limit', message: { id: 'limit', content: [] } })

      return this.emit({ type: 'result', result: 'limit', is_error: true, num_turns: 1 })
    }

    if (reply.kind === 'ask') {
      this.asked += 1

      const requestId = `ask-${this.asked}`

      this.waiting = { requestId, then: reply.then }
      this.wires.onControlRequest({
        type: 'control_request',
        request_id: requestId,
        request: {
          subtype: 'can_use_tool',
          tool_name: reply.tool,
          input: reply.input,
          tool_use_id: `t-${this.asked}`,
        },
      })

      return
    }

    if (reply.kind === 'fail') {
      return this.emit({ type: 'result', result: reply.text, is_error: true, num_turns: 1 })
    }

    this.cost += reply.cost ?? 0.01

    if (reply.kind === 'after') {
      void reply.work().then(
        () => this.finish(reply.text),
        () => this.finish(reply.text),
      )

      return
    }

    this.finish(reply.text)
  }

  private finish(text: string) {
    const id = `m-${this.turns}`

    this.emit({
      type: 'stream_event',
      event: { type: 'content_block_start', content_block: { type: 'text' } },
    })
    this.emit({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    })
    this.emit({ type: 'assistant', message: { id, content: [{ type: 'text', text }] } })
    this.emit({
      type: 'stream_event',
      event: { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    })
    this.emit({
      type: 'result',
      result: text,
      is_error: false,
      num_turns: this.turns,
      total_cost_usd: this.cost,
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 },
    })
  }
}
