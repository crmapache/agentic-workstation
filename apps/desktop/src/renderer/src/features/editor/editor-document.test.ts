import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { FileRead, FileWrite } from '@shared/fs'

import { EditorDocument } from './editor-document'
import { AUTOSAVE_DELAY_MS } from './editor.constants'

/** Модель Monaco в том объёме, который трогает документ: текст, версия, правки. */
class FakeModel {
  private listeners: (() => void)[] = []
  private versionId = 1
  private eol: string

  constructor(private text: string) {
    // Как Monaco: один перевод строк на модель, по тексту при создании.
    this.eol = text.includes('\r\n') ? '\r\n' : '\n'
  }

  getValue = () => this.text
  getEOL = () => this.eol

  pushEOL = (sequence: number) => {
    this.eol = sequence === 1 ? '\r\n' : '\n'
    this.text = this.text.replace(/\r\n|\n/g, this.eol)
    this.versionId += 1
  }

  getAlternativeVersionId = () => this.versionId
  getPositionAt = (offset: number) => offset
  pushStackElement = () => undefined
  dispose = () => undefined

  onDidChangeContent = (listener: () => void) => {
    this.listeners.push(listener)

    return { dispose: () => undefined }
  }

  pushEditOperations = (
    _: unknown,
    [edit]: { range: { start: number; end: number }; text: string }[],
  ) => {
    if (edit) this.replace(edit.range.start, edit.range.end, edit.text)
  }

  type(text: string) {
    this.replace(this.text.length, this.text.length, text)
  }

  private replace(start: number, end: number, text: string) {
    this.text = this.text.slice(0, start) + text + this.text.slice(end)
    this.versionId += 1

    for (const listener of this.listeners) listener()
  }
}

/** Диск: текст и версия; запись проверяет версию так же, как main/fs/text-file. */
const disk = {
  text: '',
  serial: 1,
  exists: true,
  outside: false,
  writes: [] as string[],
  outsideWrites: [] as boolean[],
  /** Какой путь просили у главного процесса: от корня (rel:) или абсолютный (abs:). */
  asked: [] as string[],
  hold: null as null | Promise<void>,
  readHold: null as null | Promise<void>,
}

/** Отпечаток текста - сам текст: тесту важно только, совпал ли он. */
const hashOf = (text: string) => `#${text}`

const read = (): FileRead =>
  disk.exists
    ? {
        kind: 'text',
        text: disk.text,
        version: `v${disk.serial}`,
        bom: false,
        readOnly: false,
        outside: disk.outside,
        realPath: null,
        hash: hashOf(disk.text),
      }
    : { kind: 'missing' }

/** Файл тронули: версия другая, текст прежний. */
const touchOnDisk = () => {
  disk.serial += 1
}

const changeOnDisk = (text: string) => {
  disk.text = text
  disk.serial += 1
}

vi.mock('./monaco-setup', () => ({
  monaco: {
    editor: {
      createModel: (text: string) => new FakeModel(text),
      EndOfLineSequence: { LF: 0, CRLF: 1 },
    },
    Uri: { from: () => ({}) },
    Range: { fromPositions: (start: number, end: number) => ({ start, end }) },
  },
}))

vi.mock('../../lib/highlighter', () => ({ preloadLanguage: () => Promise.resolve() }))
// Подсчёт правок для статистики - своя забота со своим тестом; здесь он только мешал бы DOM.
vi.mock('./manual-edits', () => ({ watchPastes: () => undefined, noteEditorEdit: () => undefined }))

vi.mock('../../lib/ipc', () => ({
  invoke: async (
    channel: string,
    request: {
      text: string
      expected: string | null
      base?: string | null
      outside?: boolean
      relativePath?: string
      absolutePath?: string
    },
  ) => {
    disk.asked.push(
      request.absolutePath ? `abs:${request.absolutePath}` : `rel:${request.relativePath}`,
    )

    if (channel === 'fs:readFile') {
      // Файл читается сразу, а ответ может прийти позже: так его обгоняет запись.
      const snapshot = read()

      if (disk.readHold) await disk.readHold

      return snapshot
    }

    if (disk.hold) await disk.hold

    if (!disk.exists && request.expected !== null) return { kind: 'missing' } satisfies FileWrite
    if (disk.outside && !request.outside) {
      return { kind: 'failed', reason: 'outside' } satisfies FileWrite
    }

    const touched = request.base === hashOf(disk.text)

    if (request.expected !== null && request.expected !== `v${disk.serial}` && !touched) {
      return { kind: 'conflict' } satisfies FileWrite
    }

    disk.writes.push(request.text)
    disk.outsideWrites.push(request.outside ?? false)
    changeOnDisk(request.text)
    disk.exists = true

    return {
      kind: 'saved',
      version: `v${disk.serial}`,
      hash: hashOf(request.text),
    } satisfies FileWrite
  },
}))

const host = { onStatus: vi.fn(), onGone: vi.fn() }

/** Заслонка: запись или чтение ждёт, пока тест её не откроет. */
const gate = () => {
  let release = () => undefined as void
  const hold = new Promise<void>((resolve) => (release = resolve))

  return { hold, release }
}

const open = async (text: string, path = 'src/app.ts') => {
  disk.text = text
  const document = new EditorDocument('p1', path, host)

  await document.load()

  return { document, model: document.model as unknown as FakeModel }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  Object.assign(disk, {
    text: '',
    serial: 1,
    exists: true,
    outside: false,
    writes: [],
    outsideWrites: [],
    asked: [],
    hold: null,
    readHold: null,
  })
  host.onStatus.mockClear()
  host.onGone.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('автосохранение', () => {
  it('пишет набранное после паузы, а не на каждую букву', async () => {
    const { model } = await open('a')

    model.type('b')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2)
    model.type('c')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2)

    expect(disk.writes).toEqual([])

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    expect(disk.writes).toEqual(['abc'])
  })

  it('сохранение посреди записи ждёт и её, и дописанного после неё', async () => {
    const { document, model } = await open('a')
    const firstWrite = gate()
    const secondWrite = gate()

    disk.hold = firstWrite.hold
    model.type('b')

    const first = document.save()

    model.type('c')

    let done = false
    const second = document.save().then(() => (done = true))

    disk.hold = secondWrite.hold
    firstWrite.release()
    await first
    await vi.advanceTimersByTimeAsync(0)

    // Первая запись прошла, вторая ещё идёт - выход из IDE ждал бы именно её.
    expect(done).toBe(false)

    secondWrite.release()
    await second

    expect(disk.writes).toEqual(['ab', 'abc'])
  })
})

describe('сверка с диском', () => {
  it('своих правок нет - чужая правка ложится в модель', async () => {
    const { document, model } = await open('const a = 1\n')

    changeOnDisk('const a = 2\n')
    await document.checkDisk()

    expect(model.getValue()).toBe('const a = 2\n')
    expect(document.isDirty).toBe(false)
    expect(disk.writes).toEqual([])
  })

  it('своя запись, пришедшая событием, - не чужая правка', async () => {
    const { document, model } = await open('a')

    model.type('b')
    await document.save()
    await document.checkDisk()

    expect(document.notice).toBeNull()
    expect(model.getValue()).toBe('ab')
  })

  it('свои правки есть - вопрос, автосохранение молчит, чужое не затёрто', async () => {
    const { document, model } = await open('mine')

    model.type(' edit')
    changeOnDisk('theirs')
    await document.checkDisk()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    await document.save()

    expect(document.notice).toEqual({ kind: 'conflict' })
    expect(disk.text).toBe('theirs')
  })

  it('чужая правка на диске раньше записи - запись не проходит, вопрос', async () => {
    const { document, model } = await open('mine')

    model.type(' edit')
    changeOnDisk('theirs')
    await document.save()

    expect(document.notice).toEqual({ kind: 'conflict' })
    expect(disk.text).toBe('theirs')
  })

  it('«оставить моё» пишет поверх, «взять с диска» берёт чужое', async () => {
    const mine = await open('base')

    mine.model.type(' mine')
    changeOnDisk('theirs')
    await mine.document.checkDisk()
    await mine.document.keepMine()

    expect(disk.text).toBe('base mine')
    expect(mine.document.notice).toBeNull()

    mine.model.type('!')
    changeOnDisk('theirs again')
    await mine.document.checkDisk()
    await mine.document.takeDisk()

    expect(mine.model.getValue()).toBe('theirs again')
    expect(mine.document.notice).toBeNull()
    expect(mine.document.isDirty).toBe(false)
  })

  it('файла нет уже при первом чтении - «нет на диске», а не вечное «читается»', async () => {
    disk.exists = false
    const document = new EditorDocument('p1', 'src/gone.ts', host)

    await document.load()

    expect(document.status).toEqual({ kind: 'missing' })
    expect(host.onGone).toHaveBeenCalledWith(document)
  })

  it('удалён: без правок - вкладка закрывается, с правками - вопрос', async () => {
    const clean = await open('x')

    disk.exists = false
    await clean.document.checkDisk()

    expect(host.onGone).toHaveBeenCalledWith(clean.document)

    disk.exists = true
    const dirty = await open('y')

    dirty.model.type('z')
    disk.exists = false
    await dirty.document.checkDisk()

    expect(dirty.document.notice).toEqual({ kind: 'deleted' })
  })

  it('запись, обогнавшая чтение сверки, не откатывает текст на экране', async () => {
    const { document, model } = await open('a')

    model.type('b')
    await document.save()

    const read = gate()

    disk.readHold = read.hold

    const check = document.checkDisk()

    model.type('c')
    disk.readHold = null
    await document.save()
    read.release()
    await check
    await vi.advanceTimersByTimeAsync(0)

    expect(model.getValue()).toBe('abc')
    expect(document.notice).toBeNull()
  })

  it('событие диска посреди первого чтения - сверка после него, на экране свежее', async () => {
    disk.text = 'v1'

    const read = gate()

    disk.readHold = read.hold

    const document = new EditorDocument('p1', 'src/app.ts', host)
    const loading = document.load()

    changeOnDisk('v2')
    disk.readHold = null
    await document.checkDisk()
    read.release()
    await loading
    await vi.advanceTimersByTimeAsync(0)

    expect(document.model?.getValue()).toBe('v2')
  })

  it('файл тронули посреди набора, текст прежний - не конфликт, запись проходит', async () => {
    const { document, model } = await open('base')

    model.type(' mine')
    touchOnDisk()
    await document.checkDisk()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    expect(document.notice).toBeNull()
    expect(disk.text).toBe('base mine')
  })

  it('prettier перевёл CRLF в LF - модель переходит на LF вместе с файлом', async () => {
    const { document, model } = await open('a\r\nb\r\n')

    changeOnDisk('a\nb\n')
    await document.checkDisk()

    expect(model.getEOL()).toBe('\n')
    expect(model.getValue()).toBe('a\nb\n')
    expect(document.isDirty).toBe(false)
  })
})

describe('закрытие вкладки', () => {
  it('последняя запись не прошла - документ не освобождается, правка цела', async () => {
    const { document, model } = await open('mine')

    model.type(' edit')
    changeOnDisk('theirs')

    expect(await document.close()).toBe(false)
    expect(document.notice).toEqual({ kind: 'conflict' })
    expect(document.model?.getValue()).toBe('mine edit')
  })

  it('согласился потерять - закрывается; открыли снова, пока писалось, - остаётся', async () => {
    const lost = await open('mine')

    lost.model.type(' edit')
    changeOnDisk('theirs')
    lost.document.discarded = true

    expect(await lost.document.close()).toBe(true)

    const reopened = await open('x')
    const closing = reopened.document.close()

    reopened.document.closing = false

    expect(await closing).toBe(false)
    expect(reopened.document.model).not.toBeNull()
  })
})

describe('файл по ссылке за проект', () => {
  it('сам не пишется: правка - вопрос, запись - только по просьбе', async () => {
    disk.outside = true

    const { document, model } = await open('export A=1')

    model.type('\n')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)

    expect(document.notice).toEqual({ kind: 'outside' })
    expect(disk.writes).toEqual([])

    await document.saveAsked()

    expect(disk.writes).toEqual(['export A=1\n'])
    expect(disk.outsideWrites).toEqual([true])
    expect(document.notice).toBeNull()
  })
})

describe('файл вне проекта, открытый ссылкой', () => {
  it('читается и пишется абсолютным путём; сам не пишется - только по просьбе', async () => {
    disk.outside = true

    const { document, model } = await open('# план', '/Users/max/.claude/plans/plan.md')

    model.type('\n')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)

    expect(document.notice).toEqual({ kind: 'outside' })
    expect(disk.writes).toEqual([])

    await document.saveAsked()

    expect(disk.writes).toEqual(['# план\n'])
    expect(disk.outsideWrites).toEqual([true])
    expect(new Set(disk.asked)).toEqual(new Set(['abs:/Users/max/.claude/plans/plan.md']))
  })

  it('файл проекта по-прежнему просится путём от корня', async () => {
    await open('a')

    expect(disk.asked).toEqual(['rel:src/app.ts'])
  })
})
