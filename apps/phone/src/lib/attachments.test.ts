import { it, expect, describe } from 'vitest'

import { MAX_IMAGES_CHARS } from '@agentic-workstation/remote-protocol/message-size'

import { MAX_FILES, attachmentArgs, attachmentsFit } from './attachments'
import type { PreparedImage } from './images'

const image = (data: string): PreparedImage => ({
  id: data,
  mediaType: 'image/png',
  data,
  preview: '',
})

const file = (data: string, name = 'a.pdf') => ({ id: data, name, data })

describe('вложения сообщения', () => {
  it('фото и файлы - одним весом: вместе тяжелее сообщения - не влезают', () => {
    const half = 'A'.repeat(MAX_IMAGES_CHARS / 2)

    expect(attachmentsFit([image(half)], [file(half)])).toBe(true)
    expect(attachmentsFit([image(half)], [file(`${half}AAAA`)])).toBe(false)
  })

  it('файлов не больше потолка', () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, index) => file(`F${index}`))

    expect(attachmentsFit([], files.slice(0, MAX_FILES))).toBe(true)
    expect(attachmentsFit([], files)).toBe(false)
  })

  it('в команду - без превью и id, пустые поля не едут', () => {
    expect(attachmentArgs({ images: [], files: [] })).toEqual({})
    expect(attachmentArgs({ images: [image('AAAA')], files: [file('BBBB', 'b.csv')] })).toEqual({
      images: [{ mediaType: 'image/png', data: 'AAAA' }],
      files: [{ name: 'b.csv', data: 'BBBB' }],
    })
  })
})
