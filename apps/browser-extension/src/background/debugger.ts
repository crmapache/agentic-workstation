import type { FrameTarget, EventMessage } from '@agentic-workstation/browser-protocol/protocol'

import { ChildTargets } from './child-targets'
import { MethodError } from './method-error'

/** Версия протокола CDP для chrome.debugger. */
const PROTOCOL_VERSION = '1.3'

/**
 * Подключаться к фреймам других процессов (cross-origin iframe) самим: только к фреймам, без
 * паузы на старте, сессиями в том же подключении (flatten - так команды в них идут через
 * chrome.debugger с sessionId, Chrome 125+).
 */
const AUTO_ATTACH = {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
  filter: [{ type: 'iframe' }],
}

/** Отказ CDP «такой сессии нет»: фрейм ушёл между вопросом и командой. */
const NO_SESSION = /session with given id|no session/i

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
  private readonly children = new ChildTargets()
  /** Подключения к вложенным фреймам, ещё не ответившие: attach ждёт их по вкладке. */
  private readonly nested = new Map<number, Set<Promise<void>>>()

  constructor(
    private readonly emit: (event: EventMessage) => void,
    /** Отладчик снят без IDE: вкладку закрыли, человек нажал «Отмена» в плашке Chrome. */
    private readonly detached: (tabId: number) => void,
  ) {
    chrome.debugger.onEvent.addListener((source, method, params) => {
      const { tabId, sessionId } = source

      if (tabId === undefined) return

      if (method.startsWith('Target.')) {
        this.targetEvent(tabId, sessionId ?? null, method, params)

        return
      }

      // События фреймов других процессов IDE не нужны: консоль, загрузка и диалоги - главного.
      if (sessionId === undefined && FORWARDED.has(method)) {
        this.emit({ type: 'event', name: 'cdp-event', data: { tabId, method, params } })
      }
    })
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId === undefined || !this.attached.delete(source.tabId)) return

      this.children.forget(source.tabId)
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

    let again = false

    try {
      await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION)
    } catch (error) {
      // Уже подключены (сервис-воркер перезапустился и забыл) - значит, можно работать.
      if (!/already attached/i.test(String(error))) {
        throw new MethodError('attach-failed', `Can't control this tab: ${errorText(error)}`)
      }

      again = true
    }

    this.attached.add(tabId)
    await this.watchFrames(tabId, again)

    return null
  }

  async detach(tabId: number): Promise<null> {
    this.attached.delete(tabId)
    this.children.forget(tabId)
    await chrome.debugger.detach({ tabId }).catch(() => undefined)

    return null
  }

  /** Фреймы других процессов вкладки, к которым подключён отладчик. */
  frames(tabId: number): { frames: FrameTarget[] } {
    this.assertAttached(tabId)

    return { frames: this.children.list(tabId) }
  }

  async detachAll(): Promise<void> {
    await Promise.allSettled([...this.attached].map((tabId) => this.detach(tabId)))
  }

  /**
   * Команда CDP во вкладку или, с frame, в сессию её фрейма другого процесса. Фрейма уже нет -
   * отказ no-frame: IDE скажет модели взять новый снимок, а не покажет текст протокола.
   */
  async send(
    tabId: number,
    method: string,
    params: Record<string, unknown>,
    frame?: string,
  ): Promise<unknown> {
    this.assertAttached(tabId)

    const sessionId = frame === undefined ? undefined : this.children.sessionOf(tabId, frame)

    if (frame !== undefined && !sessionId) throw noFrame(frame)

    try {
      return (
        (await chrome.debugger.sendCommand(
          sessionId ? { tabId, sessionId } : { tabId },
          method,
          params,
        )) ?? null
      )
    } catch (error) {
      if (frame !== undefined && NO_SESSION.test(errorText(error))) throw noFrame(frame)

      throw new MethodError('cdp', `${method}: ${errorText(error)}`)
    }
  }

  private assertAttached(tabId: number): void {
    if (!this.attached.has(tabId)) {
      throw new MethodError('not-attached', 'The agent is not attached to this tab.')
    }
  }

  /**
   * Фреймы других процессов: Chrome подключает к ним сессии сам и сообщает о каждой, в том
   * числе о тех, что уже есть, - раньше ответа на эту команду. Подключение, пережившее
   * сервис-воркер, сначала выключается: реестр сессий пропал вместе с прежним воркером, а
   * повторное включение о старых сессиях не сообщило бы.
   */
  private async watchFrames(tabId: number, again: boolean): Promise<void> {
    if (again) {
      await chrome.debugger
        .sendCommand({ tabId }, 'Target.setAutoAttach', { ...AUTO_ATTACH, autoAttach: false })
        .catch(() => undefined)
    }

    await this.autoAttach({ tabId })

    // Вложенные фреймы сообщают о себе сессиям родителей уже после этого ответа: снимок сразу
    // после подключения их бы не увидел. О внуках Chrome сообщает раньше ответа ребёнку.
    for (let jobs = this.nested.get(tabId); jobs?.size; jobs = this.nested.get(tabId)) {
      await Promise.all([...jobs])
    }
  }

  /** Без фреймов вкладка всё равно работает: главный фрейм снимается и нажимается как раньше. */
  private async autoAttach(target: chrome.debugger.DebuggerSession): Promise<void> {
    await chrome.debugger
      .sendCommand(target, 'Target.setAutoAttach', AUTO_ATTACH)
      .catch(() => undefined)
  }

  private track(tabId: number, job: Promise<void>): void {
    const jobs = this.nested.get(tabId) ?? new Set<Promise<void>>()
    const done = job.finally(() => {
      jobs.delete(done)

      if (!jobs.size) this.nested.delete(tabId)
    })

    jobs.add(done)
    this.nested.set(tabId, jobs)
  }

  private targetEvent(tabId: number, parent: string | null, method: string, params: unknown) {
    if (method === 'Target.attachedToTarget') {
      const sessionId = this.children.attached(tabId, parent, params)

      // О вложенном фрейме другого процесса Chrome сообщает только сессии его родителя.
      if (sessionId) this.track(tabId, this.autoAttach({ tabId, sessionId }))
    } else if (method === 'Target.detachedFromTarget') {
      this.children.detached(tabId, params)
    } else if (method === 'Target.targetInfoChanged') {
      this.children.changed(tabId, params)
    }
  }
}

const noFrame = (frame: string) =>
  new MethodError('no-frame', `The frame ${frame} is gone from this tab.`)

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
