import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import { CommandError } from '../../../state/command-error'
import { photoCaption } from './PhotoViewer.utils'

const t = ((key: string) => key) as unknown as TFunction

describe('строка под фото', () => {
  it('целиком - без строки, уменьшено - так и сказано, пока идёт - «несу»', () => {
    expect(
      photoCaption(
        t,
        { data: { dataUrl: 'x', reduced: false }, isError: false, error: null },
        true,
      ),
    ).toBeUndefined()
    expect(
      photoCaption(t, { data: { dataUrl: 'x', reduced: true }, isError: false, error: null }, true),
    ).toBe('photo.reduced')
    expect(photoCaption(t, { isError: false, error: null }, true)).toBe('photo.loading')
  })

  it('не пришло - почему и что видна миниатюра; без миниатюры - только почему', () => {
    const missing = new CommandError({ ok: false, code: 'notFound' })
    const tooBig = new CommandError({ ok: false, code: 'refused', detail: 'imageTooBig' })

    expect(photoCaption(t, { isError: true, error: missing }, true)).toBe(
      'photo.missing photo.previewShown',
    )
    expect(photoCaption(t, { isError: true, error: tooBig }, false)).toBe('photo.tooBig')
    expect(photoCaption(t, { isError: true, error: new Error('x') }, false)).toBe('photo.failed')
  })
})
