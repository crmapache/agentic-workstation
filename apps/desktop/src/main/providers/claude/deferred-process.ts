import type { CliProcess } from '../../claude/cli/cli-process'
import type { SessionWires, SessionProcess } from '../../scenarios/engine/scenario-session'

/**
 * Процесс сессии, который поднимается не сразу. Движок сценария поднимает сессию синхронно
 * и тут же пишет в неё первое сообщение, а процессу CLI сначала нужен файл шлюза коннекторов
 * со своим ключом - это запись на диск. Сообщения до готовности копятся и уходят по порядку;
 * не поднялся - движок слышит обычный выход процесса до первого слова (ошибка запуска).
 */
export class DeferredProcess implements SessionProcess {
  private process: CliProcess | null = null
  private pending: object[] = []
  private dead = false
  private readonly ready: Promise<CliProcess | null>

  /** start получает «ещё нужен ли»: остановленной сессии процесс не поднимают вовсе. */
  constructor(
    start: (wanted: () => boolean) => Promise<CliProcess | null>,
    wires: Pick<SessionWires, 'onExit'>,
  ) {
    this.ready = start(() => !this.dead).then(
      (process) => this.settle(process, wires),
      (error: unknown) => {
        console.warn('[scenarios] процесс сессии не поднялся:', error)

        return this.settle(null, wires)
      },
    )
  }

  get isAlive(): boolean {
    return !this.dead && (this.process?.isAlive ?? true)
  }

  write(message: object): void {
    if (this.dead) return
    if (this.process) this.process.write(message)
    else this.pending.push(message)
  }

  control(request: Record<string, unknown>): Promise<unknown> {
    return this.ready.then((process) =>
      process ? process.control(request) : Promise.reject(new Error('Session process is gone')),
    )
  }

  /** Ответить можно только на вопрос самого процесса - значит, он уже поднят. */
  respond(requestId: string, response: Record<string, unknown>): void {
    this.process?.respond(requestId, response)
  }

  async stop(): Promise<void> {
    this.dead = true
    this.pending = []
    await (await this.ready)?.stop()
  }

  private settle(process: CliProcess | null, wires: Pick<SessionWires, 'onExit'>) {
    // Сессию остановили, пока процесс поднимался: он не нужен.
    if (this.dead) {
      void process?.stop()

      return null
    }

    if (!process) {
      this.dead = true
      this.pending = []
      wires.onExit(null, 'Claude Code could not start.')

      return null
    }

    this.process = process

    for (const message of this.pending) process.write(message)

    this.pending = []

    return process
  }
}
