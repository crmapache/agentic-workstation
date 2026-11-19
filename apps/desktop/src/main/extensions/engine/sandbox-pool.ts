import type { ToEngine, FromEngine } from './engine-protocol'
import { ExtensionSandbox } from './sandbox'
import type { SandboxLimits } from './sandbox.constants'
import { SANDBOX_LIMITS } from './sandbox.constants'
import { SandboxBroken } from './sandbox.utils'

/**
 * Песочницы всех расширений по id - по ту сторону от главного процесса. Принимает сообщения
 * ToEngine, отвечает FromEngine; вызовы IDE из песочниц ждут ответа по своему номеру.
 */
export class SandboxPool {
  private readonly sandboxes = new Map<string, ExtensionSandbox>()
  private readonly hostCalls = new Map<number, (raw: string) => void>()
  private nextHostCall = 1

  constructor(
    private readonly send: (message: FromEngine) => void,
    private readonly limits: SandboxLimits = SANDBOX_LIMITS,
  ) {}

  receive(message: ToEngine): void {
    switch (message.type) {
      case 'start':
        return this.answer(message.callId, () => this.start(message))
      case 'stop':
        return this.answer(message.callId, () => this.stop(message.id))
      case 'dispatch':
        return this.answer(message.callId, () => this.dispatch(message))
      case 'forget':
        return this.sandboxes.get(message.id)?.forget(message.handler)
      case 'hostAnswer': {
        const resolve = this.hostCalls.get(message.hostCallId)

        this.hostCalls.delete(message.hostCallId)

        return resolve?.(message.raw)
      }
    }
  }

  private async start(message: Extract<ToEngine, { type: 'start' }>) {
    const { spec } = message

    await this.stop(spec.id)

    const sandbox = await ExtensionSandbox.create(
      spec,
      {
        call: (method, payload) =>
          new Promise<string>((resolve) => {
            const hostCallId = this.nextHostCall++

            this.hostCalls.set(hostCallId, resolve)
            this.send({ type: 'host', hostCallId, id: spec.id, method, payload })
          }),
        log: (level, text) => this.send({ type: 'log', id: spec.id, level, text }),
        broke: (problem) => {
          if (this.sandboxes.get(spec.id) === sandbox) this.sandboxes.delete(spec.id)

          this.send({ type: 'broke', id: spec.id, problem })
        },
      },
      this.limits,
    )

    this.sandboxes.set(spec.id, sandbox)

    try {
      await sandbox.start()
    } catch (error) {
      this.sandboxes.delete(spec.id)
      await sandbox.stop()
      throw error
    }
  }

  /** Вызов сломал песочницу (срок, память) - она уходит из пула вместе с ответом. */
  private async dispatch(message: Extract<ToEngine, { type: 'dispatch' }>) {
    const sandbox = this.sandbox(message.id)

    try {
      return await sandbox.dispatch(message.handler, message.args)
    } catch (error) {
      if (error instanceof SandboxBroken && this.sandboxes.get(message.id) === sandbox) {
        this.sandboxes.delete(message.id)
      }

      throw error
    }
  }

  private async stop(id: string) {
    const sandbox = this.sandboxes.get(id)

    this.sandboxes.delete(id)
    await sandbox?.stop()
  }

  private sandbox(id: string): ExtensionSandbox {
    const sandbox = this.sandboxes.get(id)

    if (!sandbox) throw new Error('The extension is not running.')

    return sandbox
  }

  private answer(callId: number, run: () => Promise<unknown> | void) {
    Promise.resolve()
      .then(run)
      .then(
        (value) => this.send({ type: 'done', callId, ok: true, value: value ?? null }),
        (error: unknown) =>
          this.send({
            type: 'done',
            callId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            problem: error instanceof SandboxBroken ? error.problem : null,
          }),
      )
  }
}
