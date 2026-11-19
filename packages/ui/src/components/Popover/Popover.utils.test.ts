import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import { isOwnToggle, openWhenReleased } from './Popover.utils'

describe('openWhenReleased', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Окна в тестах пакета нет: слушать отпускание хватит простого источника событий.
    vi.stubGlobal('window', new EventTarget())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('с клавиатуры (кнопок нет) - сразу', () => {
    const open = vi.fn()

    openWhenReleased({ buttons: 0 }, open)

    expect(open).toHaveBeenCalledOnce()
  })

  it('при зажатой кнопке - после отпускания, один раз', () => {
    const open = vi.fn()

    openWhenReleased({ buttons: 2 }, open)
    vi.runAllTimers()
    expect(open).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('pointerup'))
    expect(open).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(open).toHaveBeenCalledOnce()

    window.dispatchEvent(new Event('pointerup'))
    vi.runAllTimers()
    expect(open).toHaveBeenCalledOnce()
  })

  it('нажатие отменила система - меню не открывается и потом', () => {
    const open = vi.fn()

    openWhenReleased({ buttons: 2 }, open)
    window.dispatchEvent(new Event('pointercancel'))
    window.dispatchEvent(new Event('pointerup'))
    vi.runAllTimers()

    expect(open).not.toHaveBeenCalled()
  })
})

describe('isOwnToggle', () => {
  it('своё - событие самой панели, а не подсказки внутри неё', () => {
    const panel = {} as EventTarget
    const tip = {} as EventTarget

    expect(isOwnToggle({ target: panel, currentTarget: panel })).toBe(true)
    expect(isOwnToggle({ target: tip, currentTarget: panel })).toBe(false)
  })
})
