import type { MemorySaverPrefs, MemorySaverState } from '@shared/memory-saver'

import type { DefinitionLink } from '../definitions/definition-link'
import type { JsonFile } from '../storage/json-file'

type Service = Pick<DefinitionLink, 'state' | 'setSuspended' | 'close' | 'watch'>

/**
 * Один режим на IDE: все проекты и окна обращаются к одному владельцу процесса. Настройка
 * читается до регистрации IPC; включённый режим никогда не запускает компилятор на старте.
 */
export class MemorySaverService {
  private closing = false
  private revision = 0
  private saved = true
  private changing = false
  private queue: Promise<unknown> = Promise.resolve()

  private constructor(
    private enabled: boolean,
    private readonly file: Pick<JsonFile<MemorySaverPrefs>, 'read' | 'write'>,
    private readonly definitions: Service,
    private readonly onChange: (state: MemorySaverState) => void,
  ) {
    // Служба живёт столько же, сколько режим: отписываться незачем.
    definitions.watch(() => this.publish())
  }

  static async load(
    file: Pick<JsonFile<MemorySaverPrefs>, 'read' | 'write'>,
    definitions: Service,
    onChange: (state: MemorySaverState) => void,
  ): Promise<MemorySaverService> {
    const raw = await file.read()
    const enabled =
      typeof raw === 'object' && raw !== null && 'enabled' in raw && raw.enabled === true
    const service = new MemorySaverService(enabled, file, definitions, onChange)

    await definitions.setSuspended(enabled)

    return service
  }

  get state(): MemorySaverState {
    return {
      revision: this.revision,
      enabled: this.enabled,
      saved: this.saved,
      changing: this.changing,
      definitions: this.definitions.state,
    }
  }

  /** Переключения из разных окон исполняются по очереди: два нажатия вернут исходный режим. */
  toggle(): Promise<MemorySaverState> {
    return this.enqueue(() => !this.enabled)
  }

  /** Тот же выбор заново - после сбоя остановки: процесс останавливается и выбор пишется снова. */
  retry(): Promise<MemorySaverState> {
    return this.enqueue(() => this.enabled)
  }

  /**
   * Запрет запуска - сразу и навсегда: выключение, ждущее в очереди, уже не поднимет компилятор
   * на выходе. Выбор из очереди дописывается на диск, пока процесс выходит.
   */
  async close(): Promise<void> {
    this.closing = true
    await Promise.all([this.queue, this.definitions.close()])
  }

  /** Выбор считается, когда подошла очередь, а не при нажатии: так считают и соседние окна. */
  private enqueue(choice: () => boolean): Promise<MemorySaverState> {
    if (this.closing) return Promise.resolve(this.state)

    const operation = this.queue.then(() => this.apply(choice()))

    this.queue = operation.catch(() => undefined)

    return operation
  }

  private async apply(enabled: boolean): Promise<MemorySaverState> {
    this.enabled = enabled
    this.changing = true
    this.saved = false
    this.publish()

    const stopping = this.definitions.setSuspended(enabled)
    const [written] = await Promise.allSettled([this.file.write({ enabled }), stopping])

    this.saved = written.status === 'fulfilled'
    if (written.status === 'rejected') console.warn('[memory-saver] save failed', written.reason)

    this.changing = false
    this.publish()

    return this.state
  }

  private publish() {
    this.revision += 1
    this.onChange(this.state)
  }
}
