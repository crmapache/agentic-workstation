import { it, vi, expect, describe } from 'vitest'

import { createWindowsCursor, recoverWindowsCursor } from './win-cursor'
import type { CursorMark, WinCursorNative } from './win-cursor'
import { SYSTEM_CURSORS } from './win-input.constants'

const fakeNative = (changes: Partial<WinCursorNative> = {}) => {
  const set: [unknown, number][] = []
  const log: string[] = []
  let copies = 0
  const native: WinCursorNative = {
    createBlank: () => 'blank',
    copy: () => `copy${(copies += 1)}`,
    setSystem: (cursor, id) => {
      set.push([cursor, id])

      return 1
    },
    destroy: (cursor) => {
      log.push(`destroy ${String(cursor)}`)

      return 1
    },
    restoreAll: () => {
      log.push('restore')

      return 1
    },
    ...changes,
  }

  return { native, set, log }
}

const memoryMark = (isSet = false) => {
  const state = { isSet }
  const mark: CursorMark = {
    set: () => (state.isSet = true),
    clear: () => (state.isSet = false),
    isSet: () => state.isSet,
  }

  return { mark, state }
}

/** Выход процесса по команде теста. */
const fakeExit = () => {
  const runs = new Set<() => void>()

  return {
    onExit: (run: () => void) => {
      runs.add(run)

      return () => runs.delete(run)
    },
    exit: () => [...runs].forEach((run) => run()),
    get count() {
      return runs.size
    },
  }
}

describe('системные курсоры Windows', () => {
  it('подменяет каждый системный курсор своей копией пустого и уничтожает исходный', () => {
    const { native, set, log } = fakeNative()
    const { mark, state } = memoryMark()
    const exit = fakeExit()

    expect(createWindowsCursor(() => native, mark, exit.onExit).hide()).toBe(true)
    expect(set.map(([, id]) => id)).toEqual([...SYSTEM_CURSORS])
    expect(new Set(set.map(([cursor]) => cursor)).size).toBe(SYSTEM_CURSORS.length)
    expect(log).toEqual(['destroy blank'])
    expect(state.isSet).toBe(true)
    expect(exit.count).toBe(1)
  })

  it('возвращает схему человека, снимает метку и подписку на выход', () => {
    const { native, log } = fakeNative()
    const { mark, state } = memoryMark()
    const exit = fakeExit()
    const cursor = createWindowsCursor(() => native, mark, exit.onExit)

    cursor.hide()
    cursor.show()

    expect(log.at(-1)).toBe('restore')
    expect(state.isSet).toBe(false)
    expect(exit.count).toBe(0)
  })

  it('процесс выходит, пока курсоры пустые, - они возвращаются', () => {
    const { native, log } = fakeNative()
    const { mark, state } = memoryMark()
    const exit = fakeExit()

    createWindowsCursor(() => native, mark, exit.onExit).hide()
    exit.exit()

    expect(log.at(-1)).toBe('restore')
    expect(state.isSet).toBe(false)
  })

  it('Windows отказал посреди подмены - возвращает то, что успел подменить, и не прячет', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { native, log } = fakeNative({ setSystem: (_cursor, id) => (id === 32514 ? 0 : 1) })
    const { mark, state } = memoryMark()
    const exit = fakeExit()

    expect(createWindowsCursor(() => native, mark, exit.onExit).hide()).toBe(false)
    expect(log).toEqual(['destroy blank', 'restore'])
    expect(state.isSet).toBe(false)
    expect(exit.count).toBe(0)
  })

  it('прошлый запуск упал с пустыми курсорами - следующий их возвращает', () => {
    const { native, log } = fakeNative()
    const { mark, state } = memoryMark(true)

    recoverWindowsCursor(() => native, mark)

    expect(log).toEqual(['restore'])
    expect(state.isSet).toBe(false)
  })

  it('метки нет - вызовы Windows даже не грузятся', () => {
    const load = vi.fn(() => fakeNative().native)

    recoverWindowsCursor(load, memoryMark().mark)

    expect(load).not.toHaveBeenCalled()
  })
})
