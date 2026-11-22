import { mkdir } from 'node:fs/promises'

import type { UiEvent, ExtensionViewTree } from '@shared/extension-ui'
import type { ExtensionsState, ExtensionProblem, ExtensionLogEntry } from '@shared/extensions'

import type { FoundExtension } from './extension-catalog'
import { folderStamp, readExtension, scanExtensions } from './extension-catalog'
import { ExtensionLogs } from './extension-logs'
import { splitKey, ExtensionRuntime } from './extension-runtime'
import type { ExtensionCondition } from './extension-state'
import { secretKey, viewTrees, extensionsState } from './extension-state'
import type { ExtensionsDeps } from './extensions-service.types'
import type { ExtensionEngine } from './engine/extension-engine'
import { EngineFailure } from './engine/extension-engine'
import { callHost } from './host/host-router'
import type { HostChange, HostContext } from './host/host-types'
import { isEmptyGrant, missingGrant, effectiveGrant } from './manifest/grants'

/**
 * Расширения IDE (ADR 0091): находит папки в корне, запускает разрешённые в песочницах движка,
 * держит их вклад и отдаёт окну состояние целиком. Единственный владелец этого состояния.
 * Публичное (одобрение, настройки, хуки разговоров, инструменты) - у наследника ExtensionsService.
 */
export class ExtensionsCore {
  protected readonly found = new Map<string, FoundExtension>()
  protected readonly runtimes = new Map<string, ExtensionRuntime>()
  protected readonly conditions = new Map<string, ExtensionCondition>()
  protected readonly logs: ExtensionLogs
  protected readonly engine: ExtensionEngine
  protected readonly context: HostContext
  /** Номер запуска: ответ движка о прошлом запуске после перезагрузки уже ничего не значит. */
  private readonly generation = new Map<string, number>()
  /** Отпечаток папки на момент запуска: слежению - понять, правили ли её с тех пор. */
  private readonly stamps = new Map<string, string>()
  private toolsTimer: NodeJS.Timeout | null = null

  constructor(protected readonly deps: ExtensionsDeps) {
    this.logs = new ExtensionLogs((id, entries) => deps.events.logged(id, entries))
    this.engine = deps.engine({
      host: (id, method, args) => {
        const runtime = this.runtimes.get(id)

        if (!runtime) return Promise.reject(new Error('The extension is not running.'))

        return callHost(runtime, method, args, this.context)
      },
      log: (id, level, text) => this.logs.add(id, level, text),
      broke: (id, problem) => this.failed(id, problem),
    })
    this.context = {
      ...deps.ide,
      dialog: (runtime, dialog) => deps.asks.dialog(runtime.id, runtime.manifest.name, dialog),
      editor: (ask) => deps.asks.editor(ask),
      showView: (key) => deps.events.showView(key),
      storage: deps.storage,
      setting: (runtime, key) => this.setting(runtime.id, key),
      runCommand: (key, args) => this.runCommand(key, args),
      changed: (runtime, change) => this.contributed(runtime, change),
      forget: (runtime, handler) => this.engine.forget(runtime.id, handler),
    }
  }

  async start(): Promise<void> {
    await mkdir(this.deps.root, { recursive: true })
    await this.rescan()
  }

  /** Корень перечитан: новые запускаются, пропавшие останавливаются. */
  async rescan(): Promise<void> {
    const found = await scanExtensions(this.deps.root)
    const ids = new Set(found.map((item) => item.id))

    for (const id of [...this.found.keys()]) {
      if (ids.has(id)) continue

      await this.halt(id)
      this.found.delete(id)
      this.conditions.delete(id)
    }

    for (const item of found) {
      if (!this.found.has(item.id)) await this.launch(item)
    }

    this.emit()
  }

  /** Правка файлов от слежения: перезапуск, только если папка сменилась с последнего запуска. */
  async reloadIfChanged(id: string): Promise<void> {
    const found = this.found.get(id)

    if (found && this.stamps.get(id) === (await folderStamp(found.dir))) return

    await this.reload(id)
  }

  /** Перечитать папку расширения и запустить заново: правка файлов, «Reload». */
  async reload(id: string): Promise<void> {
    const item = await readExtension(this.deps.root, id)

    await this.halt(id)

    if (item) await this.launch(item)
    else {
      this.found.delete(id)
      this.conditions.delete(id)
    }

    this.emit()
  }

  state(): ExtensionsState {
    return extensionsState({
      root: this.deps.root,
      found: [...this.found.values()],
      runtimes: this.runtimes,
      conditions: this.conditions,
      store: this.deps.store,
      hasSecret: (id, key) => this.deps.secrets.get(secretKey(id, key)) !== null,
      errors: (id) => this.logs.errorCount(id),
    })
  }

  /** Деревья всех видов запущенных расширений. */
  views(): ExtensionViewTree[] {
    return viewTrees(this.runtimes.values())
  }

  logsOf(id: string): ExtensionLogEntry[] {
    return this.logs.list(id)
  }

  /**
   * Выход из IDE: расширения гаснут, а записи на диск дописываются до конца - выключение или
   * удаление за миг до выхода иначе потерялось бы вместе с оборванной записью.
   */
  async stop(): Promise<void> {
    if (this.toolsTimer) clearTimeout(this.toolsTimer)

    for (const id of [...this.runtimes.keys()]) await this.halt(id)

    this.logs.dispose()
    this.deps.asks.dispose()
    await this.engine.close()
    await Promise.all([this.deps.store.settled(), this.deps.storage.settled()])
  }

  /** Команда любого запущенного расширения: из поиска действий, клавиш, строки состояния. */
  async runCommand(key: string, args: readonly unknown[] = []): Promise<unknown> {
    const [id, local] = splitKey(key)
    const runtime = this.runtimes.get(id)
    const command = runtime?.commands.get(local)

    if (!runtime || !command) throw new Error(`Command "${key}" is not available.`)

    return this.dispatch(runtime, command.handler, args)
  }

  async viewEvent(key: string, event: UiEvent): Promise<void> {
    const [id, local] = splitKey(key)
    const runtime = this.runtimes.get(id)
    const view = runtime?.views.get(local)

    if (runtime && view?.listener) await this.dispatch(runtime, view.listener, [event])
  }

  /** Вызвать колбэк расширения; поломку песочницы - в статус, ошибку - вызывающему. */
  protected async dispatch(
    runtime: ExtensionRuntime,
    handler: number,
    args: readonly unknown[],
  ): Promise<unknown> {
    try {
      return await this.engine.dispatch(runtime.id, handler, args)
    } catch (error) {
      if (error instanceof EngineFailure) this.failed(runtime.id, error.problem)

      throw error
    }
  }

  protected setting(id: string, key: string): string | boolean | null {
    const field = this.found.get(id)?.manifest?.settings.find((item) => item.key === key)

    if (!field) return null
    if (field.type === 'secret')
      return this.deps.secrets.get(secretKey(id, key)) ?? field.default ?? null

    return this.deps.store.get(id).settings[key] ?? field.default ?? null
  }

  protected emit(): void {
    this.deps.events.changed(this.state())
  }

  protected async launch(item: FoundExtension): Promise<void> {
    this.found.set(item.id, item)
    this.stamps.set(item.id, await folderStamp(item.dir))

    const stored = this.deps.store.get(item.id)
    const { manifest } = item

    if (!manifest) return this.condition(item.id, 'invalid', item.problem)
    if (!stored.enabled) return this.condition(item.id, 'disabled', null)
    if (!isEmptyGrant(missingGrant(manifest.requests, stored.granted))) {
      return this.condition(item.id, 'needsApproval', null)
    }

    const generation = (this.generation.get(item.id) ?? 0) + 1
    const runtime = new ExtensionRuntime(
      manifest,
      effectiveGrant(manifest.requests, stored.granted),
    )

    this.generation.set(item.id, generation)
    this.runtimes.set(item.id, runtime)
    this.logs.restarted(item.id)
    this.condition(item.id, 'starting', null)
    this.emit()

    try {
      await this.engine.start({
        id: item.id,
        dir: item.dir,
        main: manifest.main,
        info: { id: manifest.id, name: manifest.name, version: manifest.version },
      })

      if (this.generation.get(item.id) !== generation || runtime.stopped) return

      this.condition(item.id, 'running', null)
      this.logs.add(item.id, 'info', `Started ${manifest.name} ${manifest.version}.`)
    } catch (error) {
      if (this.generation.get(item.id) !== generation) return

      const problem: ExtensionProblem =
        error instanceof EngineFailure ? error.problem : { code: 'engine', detail: String(error) }

      this.failed(item.id, problem)
    }
  }

  /** Остановить запущенное: вклад уходит, диалоги закрываются, песочница гаснет. */
  protected async halt(id: string): Promise<void> {
    const runtime = this.runtimes.get(id)

    this.generation.set(id, (this.generation.get(id) ?? 0) + 1)

    if (!runtime) return

    this.drop(runtime)
    await this.engine
      .stop(id)
      .catch((error: unknown) => console.warn('[extensions] не остановилось', id, error))
    this.condition(id, 'stopped', null)
  }

  private failed(id: string, problem: ExtensionProblem) {
    const runtime = this.runtimes.get(id)

    if (runtime) this.drop(runtime)

    this.logs.add(id, 'error', problem.detail)
    this.condition(id, 'failed', problem)
    this.emit()
  }

  private drop(runtime: ExtensionRuntime) {
    const hadTools = runtime.tools.size > 0

    runtime.stopped = true
    this.runtimes.delete(runtime.id)
    this.deps.asks.closeDialogsOf(runtime.id)

    if (hadTools) this.toolsChanged()
  }

  private condition(
    id: string,
    status: ExtensionCondition['status'],
    problem: ExtensionProblem | null,
  ) {
    this.conditions.set(id, { status, problem })
  }

  private contributed(runtime: ExtensionRuntime, change: HostChange) {
    if (runtime.stopped) return

    if (change.kind === 'view') {
      const view = runtime.views.get(change.local)

      if (view)
        this.deps.events.view({
          key: runtime.key(change.local),
          tree: view.tree,
          revision: view.revision,
        })

      return
    }

    if (change.kind === 'tools') this.toolsChanged()

    this.emit()
  }

  /** Набор инструментов поменялся: коннектору - пачкой, регистрация десятка - один раз. */
  private toolsChanged() {
    if (this.toolsTimer) return

    this.toolsTimer = setTimeout(() => {
      this.toolsTimer = null
      this.deps.events.toolsChanged()
    }, 300)
  }
}
