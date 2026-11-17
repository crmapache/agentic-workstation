import { it, expect, describe } from 'vitest'

import { opensAsImage } from './preview-images'

describe('opensAsImage', () => {
  it('картинка по расширению, в любом регистре и любом пути - картинкой', () => {
    expect(opensAsImage('docs/shot.png')).toBe(true)
    expect(opensAsImage('/tmp/Shot.JPEG')).toBe(true)
    expect(opensAsImage('C:\\Users\\max\\shot.webp')).toBe(true)
  })

  it('SVG - текст, его правят кодом', () => {
    expect(opensAsImage('icons/logo.svg')).toBe(false)
  })

  it('не картинка, имя без точки и точка только в папке - не картинкой', () => {
    expect(opensAsImage('notes.txt')).toBe(false)
    expect(opensAsImage('Makefile')).toBe(false)
    expect(opensAsImage('assets.png/README')).toBe(false)
    expect(opensAsImage('x.constructor')).toBe(false)
  })
})
