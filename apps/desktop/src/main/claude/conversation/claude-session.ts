import type { RequestResponse } from '@shared/conversation'

import type { CliMessage, ControlRequest } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import type { HeldRequest, AgentSession } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import type { Outgoing } from '../../agents/conversation/outbox'
import { claudeOf } from './claude-conversation'
import { takeControlRequest } from './control-requests'
import { exitNotice } from './exit-notice'
import { answerFor, isClaudeHeld, modeFromAlways } from './pending-requests'
import { routeMessage } from './process-router'
import { answerInChat, writeUserMessage } from './user-message'

/** Отказ на вопрос, снятый остановкой хода: модель видит, что остановил человек. */
const STOPPED_DENY = 'The user stopped the turn.'

/**
 * Живая сессия разговора у Claude Code (ADR 0083): процесс `claude -p` в stream-json. Всё,
 * что ядро просит у сессии, - словами этого протокола: сообщение строкой `user` с uuid,
 * вопросы - `control_response`, остановка - управляющий запрос `interrupt`.
 */
export class ClaudeSession implements AgentSession {
  constructor(
    private readonly runtime: ConversationRuntime,
    readonly process: CliProcess,
  ) {}

  get isAlive(): boolean {
    return this.process.isAlive
  }

  get isStopping(): boolean {
    return this.process.isStopping
  }

  /** Своя ли ещё сессия у разговора: заменённая (перезапуск, сон) поток в разговор не несёт. */
  private get isCurrent(): boolean {
    return this.runtime.session === this
  }

  send(message: Outgoing, steering: boolean): void {
    writeUserMessage(this.runtime, this.process, message, steering)
  }

  answerInChat(held: HeldRequest, message: Outgoing): void {
    if (isClaudeHeld(held)) answerInChat(this.runtime, this.process, held, message)
  }

  /**
   * Ответ человека - в `control_response`. «Разрешить и дальше» по предложению CLI сменить
   * режим ставит этот режим разговору; одобренный план уводит из режима плана.
   */
  answer(held: HeldRequest, response: RequestResponse): void {
    if (!isClaudeHeld(held)) return

    this.process.respond(held.pending.requestId, answerFor(held, response))

    const isAlways = response.kind === 'permission' && response.decision.behavior === 'allowAlways'
    const mode = isAlways ? modeFromAlways(held) : null

    if (mode === 'acceptEdits' || mode === 'plan' || mode === 'bypassPermissions') {
      this.runtime.update({ permissionMode: mode })
    }

    if (response.kind === 'plan' && response.approved) {
      this.runtime.setOptions({ permissionMode: response.acceptEdits ? 'acceptEdits' : 'default' })
    }
  }

  dismiss(held: HeldRequest): void {
    this.process.respond(held.pending.requestId, { behavior: 'deny', message: STOPPED_DENY })
  }

  async interrupt(): Promise<void> {
    await this.process.control({ subtype: 'interrupt' })
  }

  stop(): Promise<void> {
    return this.process.stop()
  }

  kill(): void {
    this.process.kill()
  }

  /** Строка потока CLI. */
  handleMessage(message: CliMessage): void {
    if (this.isCurrent) routeMessage(this.runtime, message)
  }

  /** Управляющий запрос CLI: вопрос разрешения, снятый вопрос, незнакомое. */
  handleControlRequest(request: ControlRequest): void {
    if (this.isCurrent) takeControlRequest(this.runtime, this.process, request)
  }

  /**
   * Процесс вышел. Почему оборвался ход - знает только Claude: рукопожатие свежего процесса
   * не дошло (start-failed), процесс упал посреди хода, его остановили.
   */
  handleExit(code: number | null, stderrTail: string): void {
    if (!this.isCurrent) return

    const claude = claudeOf(this.runtime)
    const notice = exitNotice(
      {
        turnActive: this.runtime.turnActive,
        freshProcess: claude.freshProcess,
        meta: this.runtime.meta,
      },
      code,
      stderrTail,
    )

    claude.freshProcess = false
    this.runtime.sessionEnded(this, notice)
  }
}
