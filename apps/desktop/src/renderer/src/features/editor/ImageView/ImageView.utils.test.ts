import { it, expect, describe } from 'vitest'

import { ZOOM_MAX, ZOOM_MIN } from './ImageView.constants'
import {
  anchorOf,
  fitScale,
  zoomStep,
  wheelScale,
  formatBytes,
  zoomPercent,
} from './ImageView.utils'

const box = (left: number, top: number, width: number, height: number) =>
  ({ getBoundingClientRect: () => ({ left, top, width, height }) }) as unknown as Element

describe('fitScale', () => {
  it('большая картинка уменьшается до места по тесной стороне', () => {
    expect(fitScale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 })).toBe(0.5)
    expect(fitScale({ width: 1000, height: 2000 }, { width: 1000, height: 500 })).toBe(0.25)
  })

  it('маленькая остаётся своего размера, без места и размера - тоже', () => {
    expect(fitScale({ width: 16, height: 16 }, { width: 1000, height: 1000 })).toBe(1)
    expect(fitScale({ width: 2000, height: 1000 }, { width: 0, height: 0 })).toBe(1)
    expect(fitScale({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(1)
  })
})

describe('zoomStep', () => {
  it('со ступени - на соседнюю, между ступенями - на ближайшую в ту сторону', () => {
    expect(zoomStep(1, 1)).toBe(1.25)
    expect(zoomStep(1, -1)).toBe(0.75)
    expect(zoomStep(0.8, 1)).toBe(1)
    expect(zoomStep(0.8, -1)).toBe(0.75)
  })

  it('почти ступень считается ступенью, за краями - предел', () => {
    expect(zoomStep(0.6699, 1)).toBe(0.75)
    expect(zoomStep(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(zoomStep(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  })
})

describe('wheelScale', () => {
  it('вверх - крупнее, вниз - мельче, щелчок колеса - не скачок в разы', () => {
    expect(wheelScale(1, -10)).toBeGreaterThan(1)
    expect(wheelScale(1, 10)).toBeLessThan(1)
    expect(wheelScale(1, 1000)).toBe(wheelScale(1, 50))
    expect(wheelScale(1, 1000)).toBeGreaterThan(0.5)
  })

  it('не выходит за пределы', () => {
    expect(wheelScale(ZOOM_MAX, -50)).toBe(ZOOM_MAX)
    expect(wheelScale(ZOOM_MIN, 50)).toBe(ZOOM_MIN)
  })
})

describe('anchorOf', () => {
  it('доля картинки под курсором, без курсора - под серединой места', () => {
    const image = box(100, 100, 200, 100)
    const scroll = box(0, 0, 400, 300)

    expect(anchorOf(image, scroll, { clientX: 150, clientY: 125 })).toEqual({
      x: 150,
      y: 125,
      partX: 0.25,
      partY: 0.25,
    })
    expect(anchorOf(image, scroll, undefined)).toEqual({ x: 200, y: 150, partX: 0.5, partY: 0.5 })
  })

  it('картинка не нарисована - держать нечего', () => {
    expect(anchorOf(box(0, 0, 0, 0), box(0, 0, 400, 300), undefined)).toBeNull()
    expect(anchorOf(null, box(0, 0, 400, 300), undefined)).toBeNull()
  })
})

describe('formatBytes и zoomPercent', () => {
  it('байты, килобайты и мегабайты; дробь - только у малых', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(250 * 1024)).toBe('250 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB')
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12 MB')
  })

  it('масштаб - целыми процентами', () => {
    expect(zoomPercent(1)).toBe('100%')
    expect(zoomPercent(0.6667)).toBe('67%')
  })
})
