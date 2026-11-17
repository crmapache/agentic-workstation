import { it, expect, describe } from 'vitest'

import { withPointer, ComputerPointer } from './computer-pointer'
import type { PointerClock } from './computer-pointer'
import { POINTER_WATCH_MS, POINTER_MOTION_GRACE_MS } from './computer.constants'
import type { Point, InputDriver } from './computer.types'

/** Мышь, системная стрелка, окно стрелки ИИ и часы - подставные, с журналом вызовов. */
const setup = (options: { canHide?: boolean } = {}) => {
  const log: string[] = []
  const mouse: { at: Point } = { at: { x: 100, y: 100 } }
  let now = 0
  let tick: (() => void) | null = null
  const clock: PointerClock = {
    now: () => now,
    setInterval: (run) => {
      tick = run

      return 'watch'
    },
    clearInterval: () => {
      tick = null
    },
  }
  const pointer = new ComputerPointer({
    cursor: () => mouse.at,
    system: {
      hide: () => {
        log.push('system hide')

        return options.canHide ?? true
      },
      show: () => log.push('system show'),
    },
    mark: {
      show: (at) => log.push(`mark show ${at.x},${at.y}`),
      moveTo: (at) => log.push(`mark move ${at.x},${at.y}`),
      press: () => log.push('mark press'),
      hide: () => log.push('mark hide'),
    },
    clock,
  })

  /** Время идёт, проверки мыши срабатывают по расписанию. */
  const pass = (ms: number) => {
    for (let at = POINTER_WATCH_MS; at <= ms; at += POINTER_WATCH_MS) {
      now += POINTER_WATCH_MS
      tick?.()
    }
  }

  return { pointer, log, mouse, pass, isWatching: () => tick !== null }
}

describe('стрелка ИИ Computer Use', () => {
  it('ИИ взял мышь - системная стрелка прячется, синяя встаёт там, где мышь', () => {
    const { pointer, log, isWatching } = setup()

    pointer.setActive(true)

    expect(log).toEqual(['system hide', 'mark show 100,100'])
    expect(isWatching()).toBe(true)
  })

  it('рука ведёт мышь - синяя едет за ней, нажатие - круг', () => {
    const { pointer, log } = setup()

    pointer.setActive(true)
    pointer.moved({ x: 110, y: 120 })
    pointer.pressed()

    expect(log.slice(2)).toEqual(['mark move 110,120', 'mark press'])
  })

  it('пауза и конец работы - системная стрелка возвращается, проверки мыши встают', () => {
    const { pointer, log, isWatching } = setup()

    pointer.setActive(true)
    pointer.setActive(false)

    expect(log.slice(2)).toEqual(['mark hide', 'system show'])
    expect(isWatching()).toBe(false)
  })

  it('человек двинул мышь между шагами - его стрелка сразу, синяя - со следующим шагом руки', () => {
    const { pointer, log, mouse, pass } = setup()

    pointer.setActive(true)
    mouse.at = { x: 400, y: 300 }
    pass(POINTER_WATCH_MS)

    expect(log.slice(2)).toEqual(['mark hide', 'system show'])

    pointer.pressed()
    pointer.moved({ x: 410, y: 300 })

    expect(log.slice(4)).toEqual(['system hide', 'mark show 410,300'])
  })

  it('курсор догоняет руку с задержкой - это не человек, пока не разошёлся с обоими шагами', () => {
    const { pointer, log, mouse, pass } = setup()

    pointer.setActive(true)
    pointer.moved({ x: 200, y: 100 })
    pointer.moved({ x: 300, y: 100 })
    // Система ещё стоит на предпоследнем шаге руки.
    mouse.at = { x: 200, y: 100 }
    pass(POINTER_MOTION_GRACE_MS * 2)

    expect(log).not.toContain('system show')

    // Сразу после шага мышь не проверяется вовсе: курсор там ещё в пути.
    pointer.moved({ x: 320, y: 100 })
    mouse.at = { x: 250, y: 100 }
    pass(POINTER_MOTION_GRACE_MS - POINTER_WATCH_MS)

    expect(log).not.toContain('system show')

    pass(POINTER_WATCH_MS * 2)

    expect(log.at(-1)).toBe('system show')
  })

  it('система не дала спрятать стрелку - синей нет, пока ИИ не возьмёт мышь заново', () => {
    const { pointer, log } = setup({ canHide: false })

    pointer.setActive(true)
    pointer.moved({ x: 150, y: 150 })

    expect(log).toEqual(['system hide'])

    pointer.setActive(false)
    pointer.setActive(true)

    expect(log).toEqual(['system hide', 'system hide'])
  })

  it('не узнать, где мышь (экран блокировки Windows), - синяя ждёт первого шага руки', () => {
    const { pointer, log } = setup()
    const blind = new ComputerPointer({
      cursor: () => {
        throw new Error('secure desktop')
      },
      system: { hide: () => true, show: () => undefined },
      mark: {
        show: () => log.push('blind show'),
        moveTo: () => undefined,
        press: () => undefined,
        hide: () => undefined,
      },
    })

    blind.setActive(true)
    expect(log).toEqual([])

    blind.moved({ x: 1, y: 2 })
    expect(log).toEqual(['blind show'])
    blind.dispose()
    pointer.dispose()
  })

  it('выход IDE - системная стрелка возвращается', () => {
    const { pointer, log } = setup()

    pointer.setActive(true)
    pointer.dispose()

    expect(log.slice(2)).toEqual(['mark hide', 'system show'])
  })
})

describe('ввод со стрелкой', () => {
  it('движение и перетаскивание ведут стрелку, нажатие - круг, отпускание - ничего', () => {
    const events: string[] = []
    const { pointer, log } = setup()
    const input = { mouse: (motion: string) => events.push(motion) } as unknown as InputDriver
    const tracked = withPointer(input, pointer)

    pointer.setActive(true)
    tracked.mouse('move', { x: 5, y: 6 }, 'left', 1, 0)
    tracked.mouse('down', { x: 5, y: 6 }, 'left', 1, 0)
    tracked.mouse('drag', { x: 7, y: 8 }, 'left', 1, 0)
    tracked.mouse('up', { x: 7, y: 8 }, 'left', 1, 0)

    expect(events).toEqual(['move', 'down', 'drag', 'up'])
    expect(log.slice(2)).toEqual(['mark move 5,6', 'mark press', 'mark move 7,8'])
  })
})
