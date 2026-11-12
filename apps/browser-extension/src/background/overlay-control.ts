import { HOST_CHANNELS } from '@agentic-workstation/browser-protocol/protocol'
import type {
  CursorPath,
  HostChannel,
  CursorAction,
} from '@agentic-workstation/browser-protocol/protocol'

import type { OverlayCommand } from '../common/messages'
import { MethodError } from './method-error'

/** Курсор не ответил за это время - страница занята или закрыта; действие идёт без него. */
const CURSOR_TIMEOUT_MS = 2000

const FRAMED_KEY = 'framedTabs'

type Point = { x: number; y: number }

const isChannel = (value: unknown): value is HostChannel =>
  HOST_CHANNELS.includes(value as HostChannel)

/**
 * Курсор и рамка агента в странице (src/overlay). Скрипт внедряется по требованию, а не во
 * все страницы человека; после перехода на другую страницу его нет - для вкладок с рамкой
 * он внедряется снова, когда страница загрузилась.
 *
 * Рамка помнит, какие IDE её поставили (dev и установленная могут держать одну вкладку), и
 * хранится в storage.local: IDE упала, сервис-воркер перезапустился - рамку всё равно снимет
 * release этой IDE, а не оставит на вкладке человека навсегда.
 *
 * Где мышь агента во вкладке, помнится до конца рамки: новая страница после перехода
 * показывает курсор там же сразу. В памяти, а не в storage: сервис-воркер перезапустился -
 * курсор вернётся со следующим движением.
 */
export class OverlayControl {
  private framed = new Map<number, Set<HostChannel>>()
  private readonly pointers = new Map<number, Point>()
  private readonly ready: Promise<void>
  private writing: Promise<void> = Promise.resolve()

  constructor() {
    this.ready = chrome.storage.local.get(FRAMED_KEY).then((stored) => {
      const saved = stored[FRAMED_KEY] as Record<string, unknown> | undefined

      for (const [tabId, channels] of Object.entries(saved ?? {})) {
        if (Array.isArray(channels)) {
          this.framed.set(Number(tabId), new Set(channels.filter(isChannel)))
        }
      }
    })

    chrome.tabs.onUpdated.addListener((tabId, change) => {
      if (change.status === 'complete' && this.framed.get(tabId)?.size) {
        void this.send(tabId, {
          type: 'aw-overlay',
          op: 'frame',
          on: true,
          cursor: this.pointers.get(tabId),
        }).catch(() => undefined)
      }
    })
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.pointers.delete(tabId)

      if (this.framed.delete(tabId)) void this.save()
    })
  }

  /** Рамка IDE channel: видна, пока её держит хоть одна IDE. */
  async frame(tabId: number, on: boolean, channel: HostChannel): Promise<null> {
    await this.ready

    const channels = this.framed.get(tabId) ?? new Set<HostChannel>()

    if (on) channels.add(channel)
    else channels.delete(channel)

    if (channels.size) {
      this.framed.set(tabId, channels)
    } else {
      this.framed.delete(tabId)
      this.pointers.delete(tabId)
    }

    await this.save()
    // Страница, куда Chrome не пускает скрипты (chrome://, магазин расширений), остаётся без
    // рамки - работе это не мешает.
    await this.send(tabId, {
      type: 'aw-overlay',
      op: 'frame',
      on: channels.size > 0,
      cursor: this.pointers.get(tabId),
    }).catch(() => undefined)

    return null
  }

  /** Снять рамки IDE со всех её вкладок, кроме тех, что она ещё держит. */
  async release(channel: HostChannel, keep: ReadonlySet<number> = new Set()): Promise<void> {
    await this.ready

    for (const [tabId, channels] of [...this.framed]) {
      if (keep.has(tabId) || !channels.has(channel)) continue

      await this.frame(tabId, false, channel)
    }
  }

  /** Chrome стартовал: id вкладок розданы заново, рамки прошлого запуска ни к чему не относятся. */
  async browserStarted(): Promise<void> {
    await this.ready
    this.framed.clear()
    this.pointers.clear()
    await this.save()
  }

  /**
   * Курсор к точке - тем путём, которым идёт мышь (way); ответ - когда дошёл. Страница занята
   * или закрыта - не ждать дольше пути и запаса.
   */
  async cursor(
    tabId: number,
    x: number,
    y: number,
    action: CursorAction,
    way: { path?: CursorPath | undefined; duration?: number | undefined } = {},
  ): Promise<null> {
    this.pointers.set(tabId, { x, y })

    try {
      await Promise.race([
        this.send(tabId, { type: 'aw-overlay', op: 'cursor', x, y, action, ...way }),
        new Promise((resolve) => setTimeout(resolve, CURSOR_TIMEOUT_MS + (way.duration ?? 0))),
      ])
    } catch (error) {
      throw new MethodError('overlay', `Cursor is unavailable on this page: ${String(error)}`)
    }

    return null
  }

  private save(): Promise<void> {
    const plain = Object.fromEntries(
      [...this.framed].map(([tabId, channels]) => [tabId, [...channels]]),
    )

    this.writing = this.writing
      .then(() => chrome.storage.local.set({ [FRAMED_KEY]: plain }))
      .catch(() => undefined)

    return this.writing
  }

  private async send(tabId: number, command: OverlayCommand): Promise<unknown> {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] })

    return chrome.tabs.sendMessage(tabId, command, { frameId: 0 })
  }
}
