import { it, expect, describe } from 'vitest'

import { SHOT_MAX_SIDE, planScreenshot } from './screenshot-plan'

const viewport = { x: 0, y: 300, width: 1280, height: 800 }

describe('размер картинки вкладки', () => {
  it('видимая часть на Retina сжимается до 2000 по длинной стороне, с места прокрутки', () => {
    const plan = planScreenshot(
      { viewport, content: { width: 1280, height: 9000 }, devicePixelRatio: 2 },
      false,
    )

    expect(plan.clip).toEqual({ x: 0, y: 300, width: 1280, height: 800, scale: 2000 / 2560 })
    expect(plan.output).toEqual({ width: 2000, height: 1250 })
    expect(plan.captureBeyondViewport).toBe(false)
    expect(plan.cut).toBeNull()
  })

  it('маленькая видимая часть без Retina не растягивается', () => {
    const plan = planScreenshot(
      {
        viewport: { ...viewport, y: 0 },
        content: { width: 1280, height: 800 },
        devicePixelRatio: 1,
      },
      false,
    )

    expect(plan.clip.scale).toBe(1)
    expect(plan.output).toEqual({ width: 1280, height: 800 })
  })

  it('вся длинная страница режется по высоте и всё равно не длиннее предела', () => {
    const plan = planScreenshot(
      { viewport, content: { width: 1280, height: 16_384 }, devicePixelRatio: 2 },
      true,
    )

    expect(plan.clip).toMatchObject({ x: 0, y: 0, width: 1280, height: 2560 })
    expect(plan.cut).toEqual({ shown: 2560, total: 16_384 })
    expect(Math.max(plan.output.width, plan.output.height)).toBeLessThanOrEqual(SHOT_MAX_SIDE)
    expect(plan.captureBeyondViewport).toBe(true)
  })

  it('короткая страница целиком, без пометки об обрезке', () => {
    const plan = planScreenshot(
      { viewport, content: { width: 1000, height: 1500 }, devicePixelRatio: 1 },
      true,
    )

    expect(plan.cut).toBeNull()
    expect(plan.clip).toMatchObject({ width: 1000, height: 1500, scale: 1 })
  })

  it('пустая страница и странный devicePixelRatio не ломают план', () => {
    const plan = planScreenshot(
      { viewport, content: { width: 0, height: 0 }, devicePixelRatio: 0 },
      true,
    )

    expect(plan.clip).toMatchObject({ width: 1, height: 1, scale: 1 })
  })
})
