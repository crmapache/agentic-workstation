import type { CursorPath, CursorAction } from '@agentic-workstation/browser-protocol/protocol'

import type { OverlayCommand } from '../common/messages'
import styles from './overlay.css?inline'
import { CURSOR_PATH, CURSOR_SIZE, moveDuration } from './overlay.utils'

/**
 * Курсор и рамка агента в странице (ADR 0040). Скрипт внедряет сервис-воркер по требованию
 * (chrome.scripting), поэтому он может прийти в одну страницу несколько раз - работает первый.
 * Всё лежит в закрытом shadow DOM поверх страницы и не ловит мышь: человек и страница его не
 * трогают, а сайт не видит его в своей разметке.
 *
 * Слой - всплывающий (popover="manual") и поднимается в верхний слой документа: иначе модальное
 * окно сайта, его popover или полноэкранное видео закрыли бы и курсор, и рамку, какой бы ни был
 * z-index. Верхний слой упорядочен по времени показа, поэтому на каждой рамке и каждом движении
 * курсора слой поднимается заново - над тем, что сайт показал после него.
 */

declare global {
  var agenticWorkstationOverlay: Overlay | undefined
}

const SVG = 'http://www.w3.org/2000/svg'

const HOST_TAG = 'agentic-workstation-overlay'

/** Слой поверх всего: стили хозяина ставятся в разметку с !important - страница не перебьёт. */
const HOST_STYLE: Record<string, string> = {
  all: 'initial',
  position: 'fixed',
  inset: '0',
  'z-index': '2147483647',
  'pointer-events': 'none',
  display: 'block',
}

type Point = { x: number; y: number }

/** Путь мыши и его время от IDE (overlay.cursor); нет - курсор едет по прямой. */
type CursorWay = { path?: CursorPath | undefined; duration?: number | undefined }

class Overlay {
  private readonly host = document.createElement(HOST_TAG)
  private readonly frame = document.createElement('div')
  private readonly cursor = document.createElement('div')
  private position: Point | null = null

  constructor() {
    const root = this.host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')

    for (const [name, value] of Object.entries(HOST_STYLE)) {
      this.host.style.setProperty(name, value, 'important')
    }

    this.host.setAttribute('popover', 'manual')
    // Слой - не часть страницы: без этого курсор и подпись попадали в дерево доступности, а
    // значит, в снимок агента - модель видела «image» и «Agentic Workstation» как элементы сайта.
    this.host.setAttribute('aria-hidden', 'true')

    style.textContent = styles
    this.frame.className = 'frame'
    this.cursor.className = 'cursor'
    // Курсор без подписи: чей он, говорят цвет и свечение, а текст рядом с ним только мешал бы
    // читать страницу.
    this.cursor.append(arrow())
    root.append(style, this.frame, this.cursor)
  }

  /**
   * Рамка; с ней - курсор там, где мышь агента (cursor), если в этом документе его ещё не было:
   * страница после перехода показывает его сразу, а не с первым движением.
   */
  setFrame(on: boolean, cursor?: Point): void {
    this.mount()
    this.raise()
    this.frame.classList.toggle('frameOn', on)

    if (!on) {
      this.cursor.classList.remove('cursorVisible')
    } else if (cursor && !this.position) {
      this.place(cursor, 0)
      this.cursor.classList.add('cursorVisible')
    }
  }

  /**
   * К точке; на нажатие - круг. Ответ - когда курсор доехал. С путём (way) - той же дорогой,
   * что идут события мыши: кривой, с разгоном и торможением; без пути - плавно по прямой.
   */
  async moveTo(x: number, y: number, action: CursorAction, way: CursorWay = {}): Promise<void> {
    this.mount()
    this.raise()

    const path = way.path ?? []
    const start = path[0]
    const from = this.position ?? (start ? { x: start[0], y: start[1] } : centre())
    const duration = path.length > 1 && way.duration ? way.duration : moveDuration(from, { x, y })

    if (!this.position) this.place(from, 0)

    this.cursor.classList.add('cursorVisible')
    // Кадр между исходной точкой и целью: иначе браузер склеит две записи и анимации не будет.
    await nextFrame()

    if (path.length > 1 && way.duration) {
      await this.follow(path, duration, { x, y })
    } else {
      this.place({ x, y }, duration)
      await wait(duration)
    }

    if (action !== 'move') this.ripple(action === 'double' ? 2 : 1)
  }

  /**
   * По пути: ключевые кадры в те же моменты, что события мыши. Конечное место ставится сразу -
   * вкладка в фоне кадров не рисует, и анимация не дошла бы; по часам ждём весь путь.
   */
  private async follow(path: CursorPath, duration: number, to: Point): Promise<void> {
    const current =
      this.cursor.style.transform || translate(path[0]?.[0] ?? to.x, path[0]?.[1] ?? to.y)
    const animation = this.cursor.animate(
      [
        { transform: current, offset: 0 },
        ...path.slice(1).map(([x, y, at]) => ({
          transform: translate(x, y),
          offset: Math.min(1, at / duration),
        })),
      ],
      { duration, easing: 'linear', fill: 'forwards' },
    )

    this.place(to, 0)
    await wait(duration)
    animation.cancel()
  }

  private place({ x, y }: Point, duration: number): void {
    this.position = { x, y }
    this.cursor.style.transitionDuration = `${duration}ms`
    this.cursor.style.transform = translate(x, y)
  }

  /** Двойное нажатие - второй круг с задержкой (класс rippleSecond в overlay.css). */
  private ripple(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const ring = document.createElement('span')

      ring.className = index ? 'ripple rippleSecond' : 'ripple'
      ring.addEventListener('animationend', () => ring.remove())
      this.cursor.append(ring)
    }
  }

  /**
   * Страница могла перестроить документ и выбросить слой - вернуть его. Слои прежнего
   * расширения (его перезагрузили: старый скрипт жив, но команд больше не слышит) - убрать,
   * иначе их рамка осталась бы на странице навсегда.
   */
  private mount(): void {
    if (this.host.isConnected) return

    for (const stale of document.querySelectorAll(HOST_TAG)) stale.remove()

    document.documentElement.append(this.host)
  }

  /** Поднять слой наверх верхнего слоя: последний показанный - сверху. */
  private raise(): void {
    if (this.host.matches(':popover-open')) this.host.hidePopover()

    this.host.showPopover()
  }
}

const arrow = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG, 'svg')
  const path = document.createElementNS(SVG, 'path')

  svg.setAttribute('class', 'arrow')
  svg.setAttribute('width', String(CURSOR_SIZE))
  svg.setAttribute('height', String(CURSOR_SIZE))
  svg.setAttribute('viewBox', `0 0 ${CURSOR_SIZE} ${CURSOR_SIZE}`)
  path.setAttribute('d', CURSOR_PATH)
  path.setAttribute('stroke-width', '1.25')
  svg.append(path)

  return svg
}

const translate = (x: number, y: number) => `translate(${x}px, ${y}px)`

const centre = (): Point => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 })

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Вкладка в фоне не рисует кадры - ждём по часам, а не по transitionend. */
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

if (!globalThis.agenticWorkstationOverlay) {
  const overlay = new Overlay()

  globalThis.agenticWorkstationOverlay = overlay
  chrome.runtime.onMessage.addListener((message: OverlayCommand, _sender, respond) => {
    if (message?.type !== 'aw-overlay') return false

    if (message.op === 'frame') {
      overlay.setFrame(message.on, message.cursor)
      respond(true)

      return false
    }

    void overlay
      .moveTo(message.x, message.y, message.action, {
        path: message.path,
        duration: message.duration,
      })
      .then(() => respond(true))

    return true
  })
}
