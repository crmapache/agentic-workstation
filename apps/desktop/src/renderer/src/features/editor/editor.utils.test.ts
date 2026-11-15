import { it, expect, describe } from 'vitest'

import { minimapColumns } from './editor.utils'

/** Ширина миникарты так, как её считает Monaco: колонки на ширину колонки, вниз до пикселя. */
const monacoWidth = (pixelRatio: number, columns: number) =>
  Math.floor(columns * ((pixelRatio >= 2 ? 2 : 1) / pixelRatio))

describe('minimapColumns', () => {
  it('gives 80 columns on Retina and on a plain monitor', () => {
    expect(minimapColumns(2, 80)).toBe(80)
    expect(minimapColumns(1, 80)).toBe(80)
  })

  it('makes the minimap exactly the asked width on scaled Windows screens', () => {
    for (const pixelRatio of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3]) {
      expect(monacoWidth(pixelRatio, minimapColumns(pixelRatio, 80))).toBe(80)
    }
  })
})
