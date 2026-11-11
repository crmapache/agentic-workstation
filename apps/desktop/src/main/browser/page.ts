import type { TabInfo, CursorAction } from '@agentic-workstation/browser-protocol/protocol'

import { BrowserError } from './browser-error'
import type { HubPort } from './browser-hub'
import type { HeldTab } from './browser-sessions'

/** Ожидание загрузки после перехода: по событию страницы или по состоянию вкладки. */
export type LoadWaiters = {
  wait: (key: string, timeoutMs: number) => Promise<boolean>
}

/**
 * Одна вкладка агента для инструмента: команды CDP, курсор и ссылки последнего снимка. Живёт
 * один вызов инструмента; отладчик уже подключён (BrowserAgent.page).
 */
export class Page {
  constructor(
    private readonly hub: HubPort,
    readonly tab: HeldTab,
    private readonly loads: LoadWaiters,
    private readonly signal: AbortSignal | undefined,
    /** Подключить отладчик заново: его сняли без нас (вторая IDE отпустила ту же вкладку). */
    private readonly reattach: () => Promise<void>,
  ) {}

  /**
   * Команда CDP. Расширение ответило «отладчик не подключён», хотя мы его подключали, - его
   * сняли без нас: вторая IDE отпустила ту же вкладку, сервис-воркер расширения перезапустился.
   * Тогда один раз подключиться заново и повторить; второй отказ - уже ответ.
   */
  async cdp<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number,
  ): Promise<T> {
    try {
      return await this.send<T>(method, params, timeoutMs)
    } catch (error) {
      if (!(error instanceof BrowserError) || error.code !== 'not-attached') throw error

      this.tab.attached = false
      await this.reattach()

      return this.send<T>(method, params, timeoutMs)
    }
  }

  private send<T>(method: string, params: Record<string, unknown>, timeoutMs?: number) {
    return this.hub.request(
      this.tab.profileKey,
      'cdp',
      { tabId: this.tab.tabId, method, params },
      { signal: this.signal, ...(timeoutMs ? { timeoutMs } : {}) },
    ) as Promise<T>
  }

  /** Курсор - украшение: страница, куда Chrome не пускает скрипты, работает и без него. */
  async cursor(x: number, y: number, action: CursorAction): Promise<void> {
    await this.hub
      .request(this.tab.profileKey, 'overlay.cursor', { tabId: this.tab.tabId, x, y, action })
      .catch(() => undefined)
  }

  info(): Promise<TabInfo | null> {
    return this.hub.request(this.tab.profileKey, 'tabs.get', { tabId: this.tab.tabId })
  }

  /**
   * Узел DOM по ссылке снимка; ссылки нет - модель берёт свежий снимок. Ссылки сбрасываются и
   * при смене адреса вкладки: узлы старой страницы указали бы на чужие элементы.
   */
  nodeOf(ref: string): number {
    const node = this.tab.refs.get(ref)

    if (node === undefined) {
      throw new BrowserError(
        'bad-request',
        `Element ${ref} is not in the latest snapshot of this tab (the page may have changed or navigated since). Take a new snapshot.`,
      )
    }

    return node
  }

  setRefs(refs: Map<string, number>): void {
    this.tab.refs = refs
  }

  waitForLoad(timeoutMs: number): Promise<boolean> {
    return this.loads.wait(this.tab.key, timeoutMs)
  }

  /**
   * После клика, Enter или перехода страница могла начать загрузку: дать ей начаться и
   * дождаться конца, но не дольше settleMs. Событие загрузки могло проскочить между двумя
   * вопросами о вкладке - поэтому ждём кусками по секунде и спрашиваем снова. Ответ - адрес и
   * заголовок после действия.
   */
  async settle(beforeUrl: string, settleMs = 10_000): Promise<{ url: string; title: string }> {
    const deadline = Date.now() + settleMs

    await new Promise((resolve) => setTimeout(resolve, 150))

    let info = await this.info()

    while (info?.status === 'loading' && Date.now() < deadline) {
      await this.waitForLoad(Math.min(1000, Math.max(0, deadline - Date.now())))
      info = await this.info()
    }

    return { url: info?.url ?? beforeUrl, title: info?.title ?? '' }
  }
}
