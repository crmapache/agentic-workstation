import { it, expect, describe } from 'vitest'

import { asidePlacement } from './aside-placement'
import type { PlacementDisplay } from './aside-placement'

const external: PlacementDisplay = {
  id: 1,
  internal: false,
  workArea: { x: 0, y: 25, width: 1920, height: 1055 },
}

const laptop: PlacementDisplay = {
  id: 2,
  internal: true,
  workArea: { x: 1920, y: 0, width: 1728, height: 1080 },
}

const SIZE = { width: 1440, height: 900 }

describe('asidePlacement', () => {
  it('уводит окно на встроенный экран, когда человек работает на внешнем', () => {
    expect(asidePlacement([external, laptop], external.id, SIZE)).toEqual({
      x: 1920 + 144,
      y: 90,
      width: 1440,
      height: 900,
    })
  })

  it('уводит на внешний, когда курсор на встроенном', () => {
    expect(asidePlacement([external, laptop], laptop.id, SIZE)).toEqual({
      x: 240,
      y: 25 + 78,
      width: 1440,
      height: 900,
    })
  })

  it('из нескольких других мониторов берёт встроенный', () => {
    const second: PlacementDisplay = { ...external, id: 3, workArea: { ...external.workArea } }

    expect(asidePlacement([external, second, laptop], external.id, SIZE)?.x).toBe(1920 + 144)
  })

  it('без встроенного берёт первый другой', () => {
    const second: PlacementDisplay = {
      id: 3,
      internal: false,
      workArea: { x: -1280, y: 0, width: 1280, height: 800 },
    }

    expect(asidePlacement([external, second], external.id, SIZE)).toEqual({
      x: -1280,
      y: 0,
      width: 1280,
      height: 800,
    })
  })

  it('с одним монитором места сбоку нет', () => {
    expect(asidePlacement([external], external.id, SIZE)).toBeNull()
  })
})
