import type { ExtensionDialogAnswer, ExtensionDialogRequest } from '@shared/extension-ui'
import type {
  ExtensionLogEntry,
  ExtensionSettingValue,
  ExtensionsActionResult,
} from '@shared/extensions'

import type { ConversationHooks } from '../agents/hooks/conversation-hooks'
import { runHooks } from './extension-hooks'
import { splitKey } from './extension-runtime'
import { secretKey } from './extension-state'
import { ExtensionsCore } from './extensions-core'
import { HostArgError } from './host/host-args'

/** Инструмент расширения для коннектора extensions. */
export type ExtensionTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
}

/** Кто зовёт инструмент: проект и разговор (у вызова снаружи - пусто). */
export type ToolCaller = { projectPath: string; conversationId: string | null }

/**
 * Расширения IDE для окна, разговоров и коннектора (ADR 0091): одобрение прав, включение,
 * настройки, вызовы из окна; хуки разговоров и инструменты для ИИ - здесь же, поверх ядра.
 */
export class ExtensionsService extends ExtensionsCore {
  /** Хуки разговоров всех провайдеров: их вставляет связка ConversationHooksLink. */
  readonly hooks: ConversationHooks = {
    beforeSend: (context) =>
      runHooks(this.subscribers('beforeSend'), this.dispatcher()).rewrite(context),
    guard: (context) => runHooks(this.subscribers('guard'), this.dispatcher()).guard(context),
    turnEnded: (context) =>
      runHooks(this.subscribers('turnEnd'), this.dispatcher()).notify(context),
    guarding: () => this.subscribers('guard').length > 0,
    rewriting: () => this.subscribers('beforeSend').length > 0,
  }

  async setEnabled(id: string, enabled: boolean): Promise<ExtensionsActionResult> {
    if (!this.found.has(id)) return this.refused('not-found')

    this.deps.store.update(id, { enabled })
    await this.reload(id)

    return this.done()
  }

  /** Выдать то, что манифест просит сейчас: права, хосты, программы - и запустить. */
  async approve(id: string): Promise<ExtensionsActionResult> {
    const manifest = this.found.get(id)?.manifest

    if (!manifest) return this.refused('not-found')

    this.deps.store.update(id, { granted: manifest.requests, enabled: true })
    await this.reload(id)

    return this.done()
  }

  async reloadOne(id: string): Promise<ExtensionsActionResult> {
    await this.reload(id)

    return this.done()
  }

  /** Убрать расширение: папку - в корзину, данные, секреты и журнал - забыть. */
  async remove(id: string): Promise<ExtensionsActionResult> {
    const found = this.found.get(id)

    if (!found) return this.refused('not-found')

    await this.halt(id)

    try {
      await this.deps.ide.trash(found.dir)
    } catch (error) {
      console.warn('[extensions] папка не ушла в корзину', found.dir, error)

      return this.refused('io')
    }

    this.found.delete(id)
    this.conditions.delete(id)
    this.deps.store.forget(id)
    this.logs.clear(id)
    await this.deps.storage.forget(id)
    await this.deps.secrets.forgetPrefix(secretKey(id, ''))
    this.emit()

    return this.done()
  }

  /** Значение настройки от человека: проверено по полю манифеста, секрет - в хранилище ключей. */
  async setSetting(
    id: string,
    key: string,
    value: ExtensionSettingValue,
  ): Promise<ExtensionsActionResult> {
    const field = this.found.get(id)?.manifest?.settings.find((item) => item.key === key)

    if (!field) return this.refused('not-found')

    if (field.type === 'secret') {
      if (typeof value !== 'string') return this.refused('invalid-name')

      await this.deps.secrets.set(secretKey(id, key), value === '' ? null : value.slice(0, 4000))
    } else if (field.type === 'switch') {
      if (typeof value !== 'boolean') return this.refused('invalid-name')

      this.storeSetting(id, key, value)
    } else {
      if (typeof value !== 'string') return this.refused('invalid-name')
      if (field.type === 'select' && !field.options.some((option) => option.value === value)) {
        return this.refused('invalid-name')
      }

      this.storeSetting(id, key, value.slice(0, 2000))
    }

    const runtime = this.runtimes.get(id)

    if (runtime) {
      for (const handler of runtime.handlersOf('settings')) {
        this.dispatch(runtime, handler, [{ key }]).catch(() => undefined)
      }
    }

    this.emit()

    return this.done()
  }

  clearLogs(id: string): ExtensionLogEntry[] {
    this.logs.clear(id)
    this.emit()

    return []
  }

  async statusClick(key: string): Promise<void> {
    const [id, local] = splitKey(key)
    const command = this.runtimes.get(id)?.statusItems.get(local)?.command

    if (command) await this.runCommand(command)
  }

  answerDialog(requestId: string, answer: ExtensionDialogAnswer): void {
    this.deps.asks.answerDialog(requestId, answer)
  }

  answerEditor(requestId: string, answer: unknown): void {
    this.deps.asks.answerEditor(requestId, answer)
  }

  pendingDialogs(): ExtensionDialogRequest[] {
    return this.deps.asks.pendingDialogs((id) => this.found.get(id)?.manifest?.name ?? id)
  }

  /** Файл проекта сохранён редактором: подписанным на files.onDidSave. */
  fileSaved(projectPath: string, path: string): void {
    void runHooks(this.subscribers('fileSaved'), this.dispatcher()).notify({ projectPath, path })
  }

  /** Инструменты для ИИ всех запущенных расширений с правом ai.tools. */
  tools(): ExtensionTool[] {
    return [...this.runtimes.values()].flatMap((runtime) =>
      runtime.grant.permissions.includes('ai.tools')
        ? [...runtime.tools].map(([name, tool]) => ({
            name: runtime.toolName(name),
            description: `${tool.description}\n\n(From the "${runtime.manifest.name}" extension.)`,
            inputSchema: tool.inputSchema,
            readOnly: tool.readOnly,
          }))
        : [],
    )
  }

  /** Вызов инструмента моделью: ответ расширения - строкой или JSON. */
  async callTool(name: string, args: Record<string, unknown>, caller: ToolCaller): Promise<string> {
    for (const runtime of this.runtimes.values()) {
      if (!runtime.grant.permissions.includes('ai.tools')) continue

      for (const [local, tool] of runtime.tools) {
        if (runtime.toolName(local) !== name) continue

        const result = await this.dispatch(runtime, tool.handler, [args, caller])

        return typeof result === 'string' ? result : JSON.stringify(result ?? null)
      }
    }

    throw new HostArgError(`Tool "${name}" is not available: its extension is not running.`)
  }

  private storeSetting(id: string, key: string, value: string | boolean) {
    const stored = this.deps.store.get(id)

    this.deps.store.update(id, { settings: { ...stored.settings, [key]: value } })
  }

  private subscribers(hook: 'beforeSend' | 'guard' | 'turnEnd' | 'fileSaved') {
    return [...this.runtimes.values()].flatMap((runtime) =>
      runtime.handlersOf(hook).map((handler) => ({ runtime, handler })),
    )
  }

  private dispatcher() {
    return (runtime: Parameters<ExtensionsCore['dispatch']>[0], handler: number, args: unknown[]) =>
      this.dispatch(runtime, handler, args)
  }

  private done(): ExtensionsActionResult {
    return { ok: true, state: this.state() }
  }

  private refused(
    error: Extract<ExtensionsActionResult, { ok: false }>['error'],
  ): ExtensionsActionResult {
    return { ok: false, error, state: this.state() }
  }
}
