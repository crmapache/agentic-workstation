import { it, expect, describe } from 'vitest'

import type { Motion } from '../browser/human-motion'
import { CLIP_SAVED_MAX_BYTES } from './computer.constants'
import { createWinClipboard } from './win-clipboard'
import type { ClipNative, ClipMessageHandler } from './win-clipboard-native'

const CF_BITMAP = 2
const CF_DIB = 8
const CF_UNICODETEXT = 13
const WM_RENDERFORMAT = 0x0305

const text = (value: string) => new Uint8Array(Buffer.from(`${value}\0`, 'utf16le'))
const asText = (bytes: Uint8Array | 'delayed' | undefined) =>
  bytes instanceof Uint8Array ? Buffer.from(bytes).toString('utf16le').replace(/\0$/, '') : bytes

/** Время, которое идёт только сном: ожидания вставки кончаются без настоящих пауз. */
const clock = (): Motion => {
  let now = 0

  return {
    random: () => 0.5,
    now: () => now,
    sleep: (ms) => {
      now += Math.max(ms, 1)

      return Promise.resolve()
    },
  }
}

/**
 * Буфер обмена Windows в памяти: владелец, открывший, форматы (отложенный - без данных, его
 * Windows просит у владельца сообщением), память по номерам. Приложение и человек действуют
 * через app() и person().
 */
const fakeClipboard = (initial: Record<number, Uint8Array> = {}) => {
  const formats = new Map<number, Uint8Array | 'delayed'>(
    Object.entries(initial).map(([format, bytes]) => [Number(format), bytes]),
  )
  const memory = new Map<number, Uint8Array>()
  const state = {
    owner: 'person' as unknown,
    opened: null as unknown,
    responds: true,
    handler: null as ClipMessageHandler | null,
    nextMemory: 1,
  }

  const native: ClipNative = {
    openClipboard: (owner) => {
      if (state.opened !== null) return 0

      state.opened = owner

      return 1
    },
    closeClipboard: () => {
      state.opened = null

      return 1
    },
    emptyClipboard: () => {
      if (state.opened === null) return 0

      formats.clear()
      state.owner = state.opened

      return 1
    },
    setClipboardData: (format, data) => {
      formats.set(format, data === null ? 'delayed' : (memory.get(data as number) ?? 'delayed'))

      return data
    },
    getClipboardData: (format) => {
      if (formats.get(format) === 'delayed') state.handler?.(WM_RENDERFORMAT, format)

      const bytes = formats.get(format)

      if (!(bytes instanceof Uint8Array)) return null

      const id = state.nextMemory++

      memory.set(id, bytes)

      return id
    },
    enumClipboardFormats: (after) => {
      const keys = [...formats.keys()]

      return keys[after === 0 ? 0 : keys.indexOf(after) + 1] ?? 0
    },
    registerFormat: (name) => 0xc000 + name.length,
    clipboardOwner: () => state.owner,
    globalAlloc: (_flags, size) => {
      const id = state.nextMemory++

      memory.set(id, new Uint8Array(size))

      return id
    },
    globalLock: (id) => id,
    globalUnlock: () => 1,
    globalSize: (id) => memory.get(id as number)?.length ?? 0,
    globalFree: (id) => {
      memory.delete(id as number)

      return null
    },
    read: (pointer, size) => (memory.get(pointer as number) ?? new Uint8Array()).slice(0, size),
    write: (pointer, bytes) => memory.get(pointer as number)?.set(bytes),
    createWindow: (handler) => {
      state.handler = handler

      return 'ide'
    },
    focusResponds: () => Promise.resolve(state.responds),
  }

  return {
    native,
    formats,
    state,
    /** Приложение в фокусе вставляет: открывает буфер и читает текст, как Блокнот. */
    app: () => {
      native.openClipboard('app')
      const id = native.getClipboardData(CF_UNICODETEXT)
      native.closeClipboard()

      return asText(id === null ? undefined : memory.get(id as number))
    },
    /** Человек копирует своё. */
    person: (value: string) => {
      native.openClipboard('person')
      native.emptyClipboard()
      formats.set(CF_UNICODETEXT, text(value))
      native.closeClipboard()
    },
  }
}

const signal = () => new AbortController().signal

describe('Windows clipboard for typing', () => {
  it('hands the text over only when the app asks, then gives the person their clipboard back', async () => {
    const clip = fakeClipboard({ [CF_UNICODETEXT]: text('secret'), 0xc0de: new Uint8Array([1, 2]) })
    const session = await createWinClipboard(() => clip.native, clock()).open()

    expect(await session?.offer('hello')).toBe(true)
    // До вставки текста в буфере нет - только обещание и пометки «не в историю, не в облако».
    expect(clip.formats.get(CF_UNICODETEXT)).toBe('delayed')
    expect(clip.formats.size).toBeGreaterThan(1)
    expect(clip.app()).toBe('hello')
    expect(await session?.taken(signal())).toBe(true)

    await session?.close()

    expect(asText(clip.formats.get(CF_UNICODETEXT))).toBe('secret')
    expect(clip.formats.get(0xc0de)).toEqual(new Uint8Array([1, 2]))
    expect(clip.formats.size).toBe(2)
  })

  it('says the paste was not taken when the app never asks for the text', async () => {
    const clip = fakeClipboard({ [CF_UNICODETEXT]: text('secret') })
    const session = await createWinClipboard(() => clip.native, clock()).open()

    await session?.offer('hello')

    expect(await session?.taken(signal())).toBe(false)

    await session?.close()

    expect(asText(clip.formats.get(CF_UNICODETEXT))).toBe('secret')
  })

  it('leaves what the person copied meanwhile, instead of putting the old clipboard back', async () => {
    const clip = fakeClipboard({ [CF_UNICODETEXT]: text('old') })
    const session = await createWinClipboard(() => clip.native, clock()).open()

    await session?.offer('hello')
    clip.person('new')
    await session?.close()

    expect(asText(clip.formats.get(CF_UNICODETEXT))).toBe('new')
  })

  it('does not touch a clipboard it cannot save whole', async () => {
    const held = fakeClipboard({ [CF_UNICODETEXT]: text('secret') })
    const huge = fakeClipboard({ [CF_UNICODETEXT]: text('secret') })

    held.state.opened = 'other app'
    huge.native.globalSize = () => CLIP_SAVED_MAX_BYTES + 1

    expect(await createWinClipboard(() => held.native, clock()).open()).toBeNull()
    expect(await createWinClipboard(() => huge.native, clock()).open()).toBeNull()
    expect(asText(huge.formats.get(CF_UNICODETEXT))).toBe('secret')
  })

  it('keeps the picture as DIB and lets Windows rebuild the GDI bitmap from it', async () => {
    const clip = fakeClipboard({ [CF_BITMAP]: new Uint8Array([9]), [CF_DIB]: new Uint8Array([7]) })
    const session = await createWinClipboard(() => clip.native, clock()).open()

    await session?.offer('hello')
    await session?.close()

    expect([...clip.formats.keys()]).toEqual([CF_DIB])
  })

  it('gives an empty clipboard back empty, and leaves it alone when nothing was offered', async () => {
    const empty = fakeClipboard()
    const untouched = fakeClipboard({ [CF_UNICODETEXT]: text('secret') })
    const used = await createWinClipboard(() => empty.native, clock()).open()
    const unused = await createWinClipboard(() => untouched.native, clock()).open()

    await used?.offer('hello')
    await used?.close()
    await unused?.close()

    expect(empty.formats.size).toBe(0)
    expect(untouched.state.owner).toBe('person')
  })
})
