import { it, expect, describe } from 'vitest'

import { encodeRecord } from './tracker-records'
import { resolveSpace, mergeTwinSpaces, normalizeRemote } from './tracker-spaces'
import { bookIn } from './tracker-test-kit'

const place = (rootPath: string, home = false) => ({
  rootPath,
  name: rootPath.split('/').at(-1) ?? '',
  home,
})

describe('адрес репозитория', () => {
  it('ssh, https и .git - один проект', () => {
    expect(normalizeRemote('git@github.com:Me/App.git')).toBe('github.com/me/app')
    expect(normalizeRemote('https://github.com/me/app')).toBe('github.com/me/app')
    expect(normalizeRemote('ssh://git@github.com/me/app.git/')).toBe('github.com/me/app')
    expect(normalizeRemote('  ')).toBeNull()
  })
})

describe('пространство проекта на этом компьютере', () => {
  it('клоны одного origin делят доску, привязка помнится', async () => {
    const book = await bookIn()
    const first = resolveSpace(book, place('/work/app'), 'github.com/me/app')
    const clone = resolveSpace(book, place('/other/app-copy'), 'github.com/me/app')

    expect(clone).toBe(first)
    expect(resolveSpace(book, place('/work/app'), null)).toBe(first)
  })

  it('две папки без git с одним именем - две доски', async () => {
    const book = await bookIn()
    const exists = () => true
    const one = resolveSpace(book, place('/work/app'), null, exists)
    const two = resolveSpace(book, place('/old/app'), null, exists)

    expect(two).not.toBe(one)
    expect(mergeTwinSpaces(book)).toBe(false)
    expect(resolveSpace(book, place('/old/app'), null, exists)).toBe(two)
  })

  it('папку без git перенесли: старого пути нет - доска переходит к новому', async () => {
    const book = await bookIn()
    const space = resolveSpace(book, place('/work/app'), null, () => true)

    expect(resolveSpace(book, place('/moved/app'), null, (path) => path !== '/work/app')).toBe(
      space,
    )
  })

  it('дом - один на всех', async () => {
    const book = await bookIn()

    expect(resolveSpace(book, place('/Users/a/.agentic-workstation/home', true), null)).toBe(
      resolveSpace(book, place('/Users/b/.agentic-workstation/home', true), null),
    )
  })

  it('другой компьютер узнаёт папку без git по имени', async () => {
    const mac = await bookIn()
    const space = resolveSpace(mac, place('/Users/me/notes'), null)
    const windows = await bookIn()

    windows.absorb(
      mac.records().map((record) => ({ id: record.id, rev: 1, text: encodeRecord(record) })),
    )

    expect(resolveSpace(windows, place('C:/Users/me/notes'), null)).toBe(space)
  })

  it('origin, появившийся после привязки, уходит в пространство', async () => {
    const book = await bookIn()
    const space = resolveSpace(book, place('/work/app'), null)

    resolveSpace(book, place('/work/app'), 'github.com/me/app')

    expect(book.get(space)?.fields.key?.[0]).toBe('remote:github.com/me/app')
  })
})
