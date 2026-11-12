import type {
  TabInfo,
  FrameTarget,
  CursorAction,
} from '@agentic-workstation/browser-protocol/protocol'

import { BrowserError } from './browser-error'
import type { HubPort } from './browser-hub'
import type { HeldTab } from './browser-sessions'
import type { ElementRef } from './frame-refs'
import type { Motion } from './human-motion'

/** Путь курсора на экране: точки [x, y, мс от начала] и время всего пути. */
export type CursorWay = { path: [number, number, number][]; duration: number }

/** Ожидание загрузки после перехода: по событию страницы или по состоянию вкладки. */
export type LoadWaiters = {
  wait: (key: string, timeoutMs: number) => Promise<boolean>
}

/**
 * Куда и сколько ждать: frame - id фрейма другого процесса (его сессия отладчика), без него -
 * сама вкладка.
 */
export type CdpOptions = {
  timeoutMs?: number | undefined
  frame?: string | undefined
  /**
   * Без отмены вызова: отпускание кнопки и клавиши уходит и после Stop - иначе Chrome считал
   * бы кнопку нажатой, и следующие движения агента тянули бы выделение.
   */
  unstoppable?: boolean | undefined
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
    /** Отмена вызова инструмента: прерывает и паузы руки. */
    readonly signal: AbortSignal | undefined,
    /** Подключить отладчик заново: его сняли без нас (вторая IDE отпустила ту же вкладку). */
    private readonly reattach: () => Promise<void>,
    /** Время и случайность руки (human-motion.ts): живые, в тестах - мгновенные. */
    readonly motion: Motion,
    /** Вкладку трогают: долгий набор не должен выглядеть простоем и терять отладчик. */
    private readonly touch: () => void = () => undefined,
  ) {}

  /**
   * Команда CDP. Расширение ответило «отладчик не подключён», хотя мы его подключали, - его
   * сняли без нас: вторая IDE отпустила ту же вкладку, сервис-воркер расширения перезапустился.
   * Тогда один раз подключиться заново и повторить; второй отказ - уже ответ. Фреймы других
   * процессов расширение подключает заново вместе с вкладкой, и их id не меняются.
   */
  async cdp<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    options: CdpOptions = {},
  ): Promise<T> {
    this.touch()

    try {
      return await this.send<T>(method, params, options)
    } catch (error) {
      if (!(error instanceof BrowserError) || error.code !== 'not-attached') throw error

      this.tab.attached = false
      await this.reattach()

      return this.send<T>(method, params, options)
    }
  }

  /**
   * Фреймы вкладки, которые живут в своём процессе. Расширение старой сборки этого не умеет -
   * тогда их нет: фреймы процесса страницы снимаются и без него.
   */
  async frameTargets(): Promise<FrameTarget[]> {
    try {
      return (
        await this.hub.request(
          this.tab.profileKey,
          'debugger.frames',
          { tabId: this.tab.tabId },
          { signal: this.signal },
        )
      ).frames
    } catch (error) {
      if (error instanceof BrowserError && error.code === 'bad-request') return []

      throw error
    }
  }

  private send<T>(method: string, params: Record<string, unknown>, options: CdpOptions) {
    const { timeoutMs, frame, unstoppable } = options

    return this.hub.request(
      this.tab.profileKey,
      'cdp',
      { tabId: this.tab.tabId, method, params, ...(frame ? { frame } : {}) },
      { signal: unstoppable ? undefined : this.signal, ...(timeoutMs ? { timeoutMs } : {}) },
    ) as Promise<T>
  }

  /**
   * Курсор - украшение: страница, куда Chrome не пускает скрипты, работает и без него. С путём
   * он идёт той же дорогой, что события мыши; расширение старше пути едет по прямой.
   */
  async cursor(x: number, y: number, action: CursorAction, way?: CursorWay): Promise<void> {
    await this.hub
      .request(this.tab.profileKey, 'overlay.cursor', {
        tabId: this.tab.tabId,
        x,
        y,
        action,
        ...way,
      })
      .catch(() => undefined)
  }

  info(): Promise<TabInfo | null> {
    return this.hub.request(this.tab.profileKey, 'tabs.get', { tabId: this.tab.tabId })
  }

  /**
   * Элемент по ссылке снимка: узел DOM и его фрейм; ссылки нет - модель берёт свежий снимок.
   * Ссылки сбрасываются и при смене адреса вкладки: узлы старой страницы указали бы на чужие
   * элементы.
   */
  elementOf(ref: string): ElementRef {
    const element = this.tab.refs.get(ref)

    if (element === undefined) {
      throw new BrowserError(
        'bad-request',
        `Element ${ref} is not in the latest snapshot of this tab (the page may have changed or navigated since). Take a new snapshot.`,
      )
    }

    return element
  }

  setRefs(refs: Map<string, ElementRef>): void {
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
