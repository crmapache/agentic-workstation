import type { CursorAction } from '@agentic-workstation/browser-protocol/protocol'

import type { OverlayCommand } from '../common/messages'
import styles from './overlay.css?inline'
import { CURSOR_SIZE, moveDuration, CURSOR_POINTS } from './overlay.utils'

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

class Overlay {
  private readonly host = document.createElement(HOST_TAG)
  private readonly frame = document.createElement('div')
  private readonly cursor = document.createElement('div')
  private position: { x: number; y: number } | null = null

  constructor() {
    const root = this.host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    const label = document.createElement('span')

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
    label.className = 'label'
    label.textContent = chrome.i18n.getMessage('cursorLabel')
    this.cursor.append(arrow(), label)
    root.append(style, this.frame, this.cursor)
  }

  setFrame(on: boolean): void {
    this.mount()
    this.raise()
    this.frame.classList.toggle('frameOn', on)

    if (!on) this.cursor.classList.remove('cursorVisible')
  }

  /** Плавно к точке; на нажатие - круг. Ответ - когда курсор доехал. */
  async moveTo(x: number, y: number, action: CursorAction): Promise<void> {
    this.mount()
    this.raise()

    const from = this.position ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const duration = moveDuration(from, { x, y })

    if (!this.position) this.place(from, 0)

    this.cursor.classList.add('cursorVisible')
    // Кадр между исходной точкой и целью: иначе браузер склеит две записи и анимации не будет.
    await nextFrame()
    this.place({ x, y }, duration)
    await wait(duration)

    if (action !== 'move') this.ripple(action === 'double' ? 2 : 1)
  }

  private place({ x, y }: { x: number; y: number }, duration: number): void {
    this.position = { x, y }
    this.cursor.style.transitionDuration = `${duration}ms`
    this.cursor.style.transform = `translate(${x}px, ${y}px)`
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
  const path = document.createElementNS(SVG, 'polygon')

  svg.setAttribute('class', 'arrow')
  svg.setAttribute('width', String(CURSOR_SIZE))
  svg.setAttribute('height', String(CURSOR_SIZE))
  svg.setAttribute('viewBox', `0 0 ${CURSOR_SIZE} ${CURSOR_SIZE}`)
  path.setAttribute('points', CURSOR_POINTS)
  path.setAttribute('stroke-width', '1.5')
  svg.append(path)

  return svg
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Вкладка в фоне не рисует кадры - ждём по часам, а не по transitionend. */
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

if (!globalThis.agenticWorkstationOverlay) {
  const overlay = new Overlay()

  globalThis.agenticWorkstationOverlay = overlay
  chrome.runtime.onMessage.addListener((message: OverlayCommand, _sender, respond) => {
    if (message?.type !== 'aw-overlay') return false

    if (message.op === 'frame') {
      overlay.setFrame(message.on)
      respond(true)

      return false
    }

    void overlay.moveTo(message.x, message.y, message.action).then(() => respond(true))

    return true
  })
}
