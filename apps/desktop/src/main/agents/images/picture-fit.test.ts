import { it, expect, describe } from 'vitest'

import { fittedSize, picturePath, pictureType } from './picture-fit'

describe('путь картинки из чипа', () => {
  it('от корня проекта, от «~» и целиком', () => {
    expect(picturePath('/p', '/Users/me', 'docs/shot.png')).toBe('/p/docs/shot.png')
    expect(picturePath('/p', '/Users/me', '~/Desktop/a.JPG')).toBe('/Users/me/Desktop/a.JPG')
    expect(picturePath('/p', '/Users/me', '/tmp/x.webp')).toBe('/tmp/x.webp')
  })

  it('не картинка и сетевой путь - не читаются', () => {
    expect(picturePath('/p', '/h', '.env')).toBeNull()
    expect(picturePath('/p', '/h', 'notes.tiff')).toBeNull()
    expect(picturePath('/p', '/h', '//server/share/a.png')).toBeNull()
    expect(picturePath('/p', '/h', '')).toBeNull()
  })
})

describe('уменьшенная копия', () => {
  it('длинная сторона - до края, пропорции целы; маленькая не растёт', () => {
    expect(fittedSize(3840, 2160, 1200)).toEqual({ width: 1200, height: 675 })
    expect(fittedSize(800, 3200, 1200)).toEqual({ width: 300, height: 1200 })
    expect(fittedSize(100, 50, 1200)).toEqual({ width: 100, height: 50 })
  })

  it('тип - по расширению', () => {
    expect(pictureType('a.jpeg')).toBe('image/jpeg')
    expect(pictureType('a.svg')).toBe('image/svg+xml')
    expect(pictureType('a.txt')).toBe('')
  })
})
