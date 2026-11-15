import { it, expect, describe } from 'vitest'

import { visibleAreaOf, followVisibleViewport } from './visible-viewport'

/** Поддельные окно и visualViewport: размеры меняются руками, события - вызовом. */
const fakeWindow = (viewport: { offsetTop: number; height: number; scale: number }) => {
  const listeners = new Map<string, () => void>()
  const properties = new Map<string, string>()
  const visualViewport = {
    ...viewport,
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  }
  const style = {
    setProperty: (name: string, value: string) => properties.set(name, value),
    removeProperty: (name: string) => properties.delete(name),
  }
  const target = { visualViewport, document: { documentElement: { style } } }

  return {
    target: target as unknown as Window,
    visualViewport,
    properties,
    listeners,
    fire: (type: string) => listeners.get(type)?.(),
  }
}

describe('видимая часть страницы', () => {
  it('без клавиатуры - вся страница, с ней - над клавиатурой, сдвинутая - со сдвигом', () => {
    expect(visibleAreaOf({ offsetTop: 0, height: 714, scale: 1 })).toEqual({ top: 0, height: 714 })
    expect(visibleAreaOf({ offsetTop: 120, height: 330, scale: 1 })).toEqual({
      top: 120,
      height: 330,
    })
  })

  it('увеличенная щипком - не подгоняем', () => {
    expect(visibleAreaOf({ offsetTop: 40, height: 300, scale: 2 })).toBeNull()
  })

  it('переменные окон - сразу и вслед за клавиатурой; отписка снимает слушателей', () => {
    const page = fakeWindow({ offsetTop: 0, height: 714, scale: 1 })
    const stop = followVisibleViewport(page.target)

    expect(page.properties.get('--size-visible-height')).toBe('714px')

    page.visualViewport.height = 330
    page.visualViewport.offsetTop = 50
    page.fire('resize')
    expect(page.properties.get('--offset-visible-top')).toBe('50px')
    expect(page.properties.get('--size-visible-height')).toBe('330px')

    page.visualViewport.scale = 2
    page.fire('scroll')
    expect(page.properties.size).toBe(0)

    stop()
    expect(page.listeners.size).toBe(0)
  })
})
