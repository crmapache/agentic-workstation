import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { TerminalOutput, TerminalSession } from '@shared/terminal'

import { TerminalService } from './terminal-service'
import { FLOW_LOW, FLUSH_MS, FLOW_HIGH, KILL_GRACE_MS } from './terminal.constants'
import type { SpawnPty, PtyProcess } from './terminal.types'

/** Поддельная оболочка: тест сам пишет её вывод и решает, когда она выйдет. */
const fakePty = () => {
  const dataListeners: ((data: string) => void)[] = []
  const exitListeners: (() => void)[] = []
  const pty = {
    signals: [] as string[],
    written: [] as string[],
    paused: false,
    onData: (listener: (data: string) => void) => {
      dataListeners.push(listener)

      return { dispose: () => undefined }
    },
    onExit: (listener: () => void) => {
      exitListeners.push(listener)

      return { dispose: () => undefined }
    },
    write: (data: string) => pty.written.push(data),
    resize: () => undefined,
    kill: (signal?: string) => pty.signals.push(signal ?? 'SIGHUP'),
    pause: () => {
      pty.paused = true
    },
    resume: () => {
      pty.paused = false
    },
    emit: (data: string) => dataListeners.forEach((listener) => listener(data)),
    exit: () => exitListeners.forEach((listener) => listener()),
  }

  return pty
}

type FakePty = ReturnType<typeof fakePty>

const setUp = () => {
  const ptys: FakePty[] = []
  const output: TerminalOutput[] = []
  const sessions: TerminalSession[][] = []
  const spawn: SpawnPty = () => {
    const pty = fakePty()

    ptys.push(pty)

    return Promise.resolve(pty as unknown as PtyProcess)
  }
  const service = new TerminalService(
    { output: (item) => output.push(item), sessions: (list) => sessions.push(list) },
    { spawn, shell: () => '/bin/zsh', env: () => Promise.resolve({}) },
  )

  return { service, ptys, output, sessions }
}

const pty = (ptys: FakePty[], index: number) => {
  const found = ptys[index]

  if (!found) throw new Error(`нет оболочки ${index}`)

  return found
}

describe('TerminalService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('номер вкладки - наименьший свободный в своём проекте', async () => {
    const { service } = setUp()

    await service.open('a', '/a', 80, 24)
    const second = await service.open('a', '/a', 80, 24)

    await service.open('b', '/b', 80, 24)
    service.close(second.sessions[0]?.id ?? '')
    await service.open('a', '/a', 80, 24)

    const ordinals = service
      .list()
      .map((session) => `${session.projectId}${session.ordinal}`)
      .sort()

    expect(ordinals).toEqual(['a1', 'a2', 'b1'])
  })

  it('оболочка не запустилась - вкладки нет, причина - null', async () => {
    const service = new TerminalService(
      { output: () => undefined, sessions: () => undefined },
      {
        spawn: () => Promise.reject(new Error('нет')),
        shell: () => '/x',
        env: () => Promise.resolve({}),
      },
    )
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(await service.open('a', '/a', 80, 24)).toEqual({ sessions: [], created: null })
    consoleWarn.mockRestore()
  })

  it('вывод уходит окну одним куском за такт, с концом счёта', async () => {
    const { service, ptys, output } = setUp()
    const { created } = await service.open('a', '/a', 80, 24)

    pty(ptys, 0).emit('ab')
    pty(ptys, 0).emit('cd')
    expect(output).toEqual([])
    vi.advanceTimersByTime(FLUSH_MS)
    expect(output).toEqual([{ sessionId: created, data: 'abcd', end: 4 }])
  })

  it('окно отстало - оболочка на паузе, догнало - снова идёт', async () => {
    const { service, ptys } = setUp()
    const { created } = await service.open('a', '/a', 80, 24)
    const shell = pty(ptys, 0)

    shell.emit('x'.repeat(FLOW_HIGH + 1))
    expect(shell.paused).toBe(true)
    service.ack(created ?? '', FLOW_HIGH - FLOW_LOW)
    expect(shell.paused).toBe(true)
    service.ack(created ?? '', 2)
    expect(shell.paused).toBe(false)
  })

  it('подключение заново - хвост и снятая пауза', async () => {
    const { service, ptys } = setUp()
    const { created } = await service.open('a', '/a', 80, 24)
    const shell = pty(ptys, 0)

    shell.emit('x'.repeat(FLOW_HIGH + 1))
    expect(service.replay(created ?? '')).toEqual({
      data: 'x'.repeat(FLOW_HIGH + 1),
      end: FLOW_HIGH + 1,
    })
    expect(shell.paused).toBe(false)
  })

  it('вышедшая сама оболочка уходит из набора, последний вывод доходит', async () => {
    const { service, ptys, output, sessions } = setUp()

    await service.open('a', '/a', 80, 24)
    pty(ptys, 0).emit('bye')
    pty(ptys, 0).exit()
    expect(output.map((item) => item.data)).toEqual(['bye'])
    expect(sessions).toEqual([[]])
  })

  it('закрытая вкладка: SIGHUP, упрямая оболочка - SIGKILL', async () => {
    const { service, ptys, sessions } = setUp()
    const { created } = await service.open('a', '/a', 80, 24)

    expect(service.close(created ?? '')).toEqual([])
    expect(pty(ptys, 0).signals).toEqual(['SIGHUP'])
    vi.advanceTimersByTime(KILL_GRACE_MS)
    expect(pty(ptys, 0).signals).toEqual(['SIGHUP', 'SIGKILL'])
    // Закрыла вкладка, а не оболочка: второй раз набор не рассылается.
    pty(ptys, 0).exit()
    expect(sessions).toEqual([])
  })

  it('закрытый проект гасит свои вкладки, чужие живут', async () => {
    const { service, ptys, sessions } = setUp()

    await service.open('a', '/a', 80, 24)
    await service.open('b', '/b', 80, 24)
    service.keepProjects(['b'])
    expect(pty(ptys, 0).signals).toEqual(['SIGHUP'])
    expect(pty(ptys, 1).signals).toEqual([])
    expect(sessions.at(-1)?.map((session) => session.projectId)).toEqual(['b'])
  })

  it('выход IDE ждёт, пока оболочки выйдут', async () => {
    const { service, ptys } = setUp()

    await service.open('a', '/a', 80, 24)

    let done = false
    const shutdown = service.shutdown().then(() => {
      done = true
    })

    await Promise.resolve()
    expect(done).toBe(false)
    pty(ptys, 0).exit()
    await shutdown
    expect(done).toBe(true)
  })
})
