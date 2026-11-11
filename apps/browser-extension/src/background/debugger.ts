import type { EventMessage } from '@agentic-workstation/browser-protocol/protocol'

import { MethodError } from './method-error'

/** Версия протокола CDP для chrome.debugger. */
const PROTOCOL_VERSION = '1.3'

/**
 * События CDP, которые нужны IDE: консоль (инструмент console), загрузка страницы (ожидание
 * после перехода) и диалоги alert/confirm (иначе страница встанет). Остальное - не пересылать.
 */
const FORWARDED = new Set([
  'Runtime.consoleAPICalled',
  'Runtime.exceptionThrown',
  'Log.entryAdded',
  'Page.loadEventFired',
  'Page.frameNavigated',
  'Page.javascriptDialogOpening',
])

/**
 * Отладчик во вкладках агента (решение владельца: CDP через chrome.debugger). Подключается
 * по запросу IDE и отключается ею же - на время работы, чтобы плашка Chrome «расширение
 * отлаживает браузер» была видна только тогда.
 */
export class Debuggers {
  private readonly attached = new Set<number>()

  constructor(
    private readonly emit: (event: EventMessage) => void,
    /** Отладчик снят без IDE: вкладку закрыли, человек нажал «Отмена» в плашке Chrome. */
    private readonly detached: (tabId: number) => void,
  ) {
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (source.tabId !== undefined && FORWARDED.has(method)) {
        this.emit({
          type: 'event',
          name: 'cdp-event',
          data: { tabId: source.tabId, method, params },
        })
      }
    })
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId === undefined || !this.attached.delete(source.tabId)) return

      this.detached(source.tabId)
      this.emit({ type: 'event', name: 'debugger-detached', data: { tabId: source.tabId, reason } })
    })
  }

  isAttached(tabId: number): boolean {
    return this.attached.has(tabId)
  }

  get count(): number {
    return this.attached.size
  }

  async attach(tabId: number): Promise<null> {
    if (this.attached.has(tabId)) return null

    try {
      await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION)
    } catch (error) {
      // Уже подключены (сервис-воркер перезапустился и забыл) - значит, можно работать.
      if (!/already attached/i.test(String(error))) {
        throw new MethodError('attach-failed', `Can't control this tab: ${errorText(error)}`)
      }
    }

    this.attached.add(tabId)

    return null
  }

  async detach(tabId: number): Promise<null> {
    this.attached.delete(tabId)
    await chrome.debugger.detach({ tabId }).catch(() => undefined)

    return null
  }

  async detachAll(): Promise<void> {
    await Promise.allSettled([...this.attached].map((tabId) => this.detach(tabId)))
  }

  async send(tabId: number, method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.attached.has(tabId)) {
      throw new MethodError('not-attached', 'The agent is not attached to this tab.')
    }

    try {
      return (await chrome.debugger.sendCommand({ tabId }, method, params)) ?? null
    } catch (error) {
      throw new MethodError('cdp', `${method}: ${errorText(error)}`)
    }
  }
}

export const errorText = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error)

  // chrome.debugger отдаёт ошибку CDP строкой JSON: {"code":-32000,"message":"…"}.
  try {
    const parsed = JSON.parse(text) as { message?: unknown }

    return typeof parsed.message === 'string' ? parsed.message : text
  } catch {
    return text
  }
}
