import { it, expect, describe } from 'vitest'

import { withFiles } from './attached-files'

const saveAt = (dir: string) => (name: string) => Promise.resolve(`${dir}/${name}`)

describe('файлы с телефона - ссылками в текст', () => {
  it('без файлов текст как есть', async () => {
    expect(await withFiles('hi', [], saveAt('/p'))).toBe('hi')
  })

  it('пути «@» после слов, по порядку файлов', async () => {
    const files = [
      { name: 'a.pdf', data: 'AAAA' },
      { name: 'b.csv', data: 'BBBB' },
    ]

    expect(await withFiles('look', files, saveAt('/p'))).toBe('look @/p/a.pdf @/p/b.csv')
  })

  it('одни файлы без слов - одни ссылки', async () => {
    expect(await withFiles('', [{ name: 'a.pdf', data: 'AAAA' }], saveAt('/p'))).toBe('@/p/a.pdf')
  })

  it('хоть один не записался - null, а не сообщение без файла', async () => {
    const save = (name: string) => Promise.resolve(name === 'bad.bin' ? null : `/p/${name}`)
    const files = [
      { name: 'a.pdf', data: 'AAAA' },
      { name: 'bad.bin', data: 'BBBB' },
    ]

    expect(await withFiles('look', files, save)).toBeNull()
  })
})
