import { it, expect, describe } from 'vitest'

import { chipPicture } from './picture.utils'

const said = { kind: 'said', conversationId: 'c', messageId: 'm', image: 0 } as const

describe('картинка за чипом', () => {
  it('байты в чипе - сразу, без вопросов главному процессу', () => {
    expect(chipPicture({ kind: 'img', value: 'Image #1', data: 'data:x' })).toEqual({
      data: 'data:x',
    })
  })

  it('вставленная с файлом - файлом, без имени под превью; файл убран - местом чипа', () => {
    expect(chipPicture({ kind: 'img', value: 'Image #2', path: '/u/pasted/a.png' }, said)).toEqual({
      place: { kind: 'file', path: '/u/pasted/a.png' },
      fallback: said,
    })
    expect(chipPicture({ kind: 'img', value: 'Image #2', path: '/u/pasted/a.png' })).toEqual({
      place: { kind: 'file', path: '/u/pasted/a.png' },
    })
  })

  it('выбранная - её путём, и путь целиком под превью', () => {
    expect(chipPicture({ kind: 'img', value: 'docs/shot.png' })).toEqual({
      place: { kind: 'file', path: 'docs/shot.png' },
      name: 'docs/shot.png',
    })
  })

  it('вставленная без файла - местом, где нарисован чип; без места - ничего', () => {
    expect(chipPicture({ kind: 'img', value: 'Image #3' }, said)).toEqual({ place: said })
    expect(chipPicture({ kind: 'img', value: 'Image #3' })).toBeNull()
  })

  it('не картинка и сетевой путь - без превью', () => {
    expect(chipPicture({ kind: 'file', value: 'a.png' })).toBeNull()
    expect(chipPicture({ kind: 'img', value: '//server/a.png' })).toBeNull()
  })
})
