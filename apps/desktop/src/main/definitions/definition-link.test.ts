import { EventEmitter } from 'node:events'

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'

import { DefinitionLink } from './definition-link'
import {
  DEFINITION_STOP_MS,
  DEFINITION_REQUEST_MS,
  DEFINITION_KILL_GRACE_MS,
} from './definition.constants'
import type { WorkerInbound } from './definition.types'

const { fork } = vi.hoisted(() => ({ fork: vi.fn() }))

vi.mock('electron', () => ({ utilityProcess: { fork } }))

class Child extends EventEmitter {
  pid: number | undefined
  kill = vi.fn(() => true)
  postMessage = vi.fn<(_message: WorkerInbound) => void>()

  spawn() {
    this.pid = 1234
    this.emit('spawn')
  }

  exit() {
    this.emit('exit', 0)
    this.pid = undefined
  }
}

const job = { file: '/project/a.ts', version: '1', offset: 1, text: 'const a = 1' }
const idleMs = 1000
let child: Child
let link: DefinitionLink
let signal: MockInstance<typeof process.kill>

beforeEach(() => {
  // pid в тестах выдуманный: настоящий SIGKILL по нему убил бы чужой процесс машины.
  signal = vi.spyOn(process, 'kill').mockImplementation(() => true)
  vi.useFakeTimers()
  child = new Child()
  fork.mockReset().mockReturnValue(child)
  link = new DefinitionLink('/owned/definition-worker.js', idleMs)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  signal.mockRestore()
})

const start = async () => {
  await link.setSuspended(false)
  const answer = link.request(job).catch((error: unknown) => String(error))

  child.spawn()

  return { answer }
}

const stop = async () => {
  const closing = link.setSuspended(true)

  child.exit()
  await closing
}

describe('DefinitionLink lifecycle', () => {
  it('cannot spawn before preferences are loaded or while memory saving is enabled', async () => {
    expect(await link.request(job)).toEqual({ kind: 'none' })
    await link.setSuspended(true)
    for (const file of ['/one/a.ts', '/two/b.ts', '/outside/c.ts']) {
      expect(await link.request({ ...job, file, version: 'agent-edit' })).toEqual({ kind: 'none' })
    }
    expect(fork).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses one process for all projects and waits for exit before reporting stopped', async () => {
    const { answer } = await start()
    const other = link.request({ ...job, file: '/other/b.ts' }).catch(String)
    const closed = link.setSuspended(true)
    const finished = vi.fn()

    void closed.then(finished)
    expect(child.kill).toHaveBeenCalledOnce()
    expect(link.state).toMatchObject({ phase: 'stopping', pid: 1234 })
    expect(await link.request(job)).toEqual({ kind: 'none' })
    await Promise.resolve()
    expect(finished).not.toHaveBeenCalled()
    expect(fork).toHaveBeenCalledOnce()
    child.exit()
    await closed
    expect(link.state).toEqual({ phase: 'idle', pid: null, failure: null })
    expect(await answer).toContain('stopped')
    expect(await other).toContain('stopped')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops a process that was still spawning without mistaking missing pid for exit', async () => {
    await link.setSuspended(false)
    const answer = link.request(job).catch(String)
    const closed = link.setSuspended(true)

    expect(child.kill).not.toHaveBeenCalled()
    expect(link.state.phase).toBe('stopping')
    child.spawn()
    expect(child.kill).toHaveBeenCalledOnce()
    child.exit()
    await closed
    expect(await answer).toContain('stopped')
    expect(child.listenerCount('spawn')).toBe(1)
  })

  it('forces a process that ignores the polite stop and counts its exit as success', async () => {
    await start()
    const closed = link.setSuspended(true)

    expect(child.kill).toHaveBeenCalledOnce()
    expect(signal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DEFINITION_KILL_GRACE_MS)
    expect(signal).toHaveBeenCalledExactlyOnceWith(1234, 'SIGKILL')
    child.exit()
    await closed
    expect(link.state).toEqual({ phase: 'idle', pid: null, failure: null })
  })

  it('forces at once when the polite stop is refused', async () => {
    await start()
    child.kill.mockReturnValue(false)
    const closed = link.setSuspended(true)

    expect(signal).toHaveBeenCalledExactlyOnceWith(1234, 'SIGKILL')
    child.exit()
    await closed
    expect(link.state).toEqual({ phase: 'idle', pid: null, failure: null })
  })

  it('retains ownership when even SIGKILL brings no exit and never creates a duplicate', async () => {
    await start()
    child.kill.mockReturnValue(false)
    const closing = link.setSuspended(true)
    const rejected = expect(closing).rejects.toThrow('timed out')

    await vi.advanceTimersByTimeAsync(DEFINITION_STOP_MS)
    await rejected
    expect(signal).toHaveBeenCalledWith(1234, 'SIGKILL')
    expect(link.state).toMatchObject({ phase: 'error', failure: 'stop', pid: 1234 })
    expect(await link.request(job)).toEqual({ kind: 'none' })
    child.kill.mockReturnValue(true)
    const resumed = link.setSuspended(false)
    const asked = link.request(job)
    const old = child

    expect(fork).toHaveBeenCalledOnce()
    child = new Child()
    fork.mockReturnValue(child)
    old.exit()
    await resumed
    await vi.advanceTimersByTimeAsync(0)
    expect(fork).toHaveBeenCalledTimes(2)
    child.spawn()
    const id = child.postMessage.mock.calls[0]?.[0].id

    child.emit('message', { id, ok: true, answer: { kind: 'none' } })
    expect(await asked).toEqual({ kind: 'none' })
  })

  it('reports stop timeout and accepts a late exit as actual release', async () => {
    await start()
    const closed = link.setSuspended(true)
    const rejected = expect(closed).rejects.toThrow('timed out')

    await vi.advanceTimersByTimeAsync(DEFINITION_STOP_MS)
    await rejected
    expect(link.state).toMatchObject({ phase: 'error', failure: 'stop', pid: 1234 })
    expect(await link.request(job)).toEqual({ kind: 'none' })
    child.exit()
    expect(link.state).toEqual({ phase: 'idle', pid: null, failure: null })
  })

  it('still stops a very late spawn after the stop deadline', async () => {
    await link.setSuspended(false)
    void link.request(job).catch(String)
    const closed = link.setSuspended(true).catch(String)

    await vi.advanceTimersByTimeAsync(DEFINITION_STOP_MS)
    await closed
    child.spawn()
    expect(child.kill).toHaveBeenCalledOnce()
    expect(link.state.phase).toBe('stopping')
    await stop()
  })

  it('restores lazily, ignores old replies, and sends a fresh document to a new process', async () => {
    await start()
    await stop()
    await link.setSuspended(false)
    expect(fork).toHaveBeenCalledOnce()
    const old = child

    child = new Child()
    fork.mockReturnValue(child)
    const answer = link.request(job)
    const id = child.postMessage.mock.calls[0]?.[0].id

    child.spawn()
    old.emit('message', { id, ok: true, answer: { kind: 'found' } })
    child.emit('message', { id, ok: true, answer: { kind: 'needText' } })
    expect(await answer).toEqual({ kind: 'needText' })
    expect(fork).toHaveBeenCalledTimes(2)
    await stop()
  })

  it('cleans up a failed spawn and allows a later request to recover', async () => {
    await link.setSuspended(false)
    fork.mockImplementationOnce(() => {
      throw new Error('spawn failed')
    })
    await expect(link.request(job)).rejects.toThrow('spawn failed')
    expect(link.state).toMatchObject({ phase: 'error', failure: 'start', pid: null })
    expect(vi.getTimerCount()).toBe(0)
    await start()
    expect(link.state.phase).toBe('running')
    await stop()
  })

  it('rejects requests on a crash and tells a crash of a running process from a failed start', async () => {
    const { answer } = await start()

    child.exit()
    expect(await answer).toContain('exited')
    expect(link.state).toMatchObject({ phase: 'error', failure: 'crash', pid: null })
    expect(vi.getTimerCount()).toBe(0)
    child = new Child()
    fork.mockReturnValue(child)
    const early = link.request(job).catch(String)

    child.exit()
    expect(await early).toContain('exited')
    expect(link.state).toMatchObject({ phase: 'error', failure: 'start', pid: null })
  })

  it('waits for the exit after a fatal error instead of stopping a dying process', async () => {
    const { answer } = await start()

    child.emit('error', 'FatalError', 'V8')
    expect(await answer).toContain('failed')
    expect(link.state).toMatchObject({ phase: 'stopping', failure: 'crash' })
    child.exit()
    await vi.advanceTimersByTimeAsync(0)
    expect(child.kill).not.toHaveBeenCalled()
    expect(signal).not.toHaveBeenCalled()
    expect(link.state).toMatchObject({ phase: 'error', failure: 'crash', pid: null })
  })

  it('accepts exit after a late process error as successful memory saving', async () => {
    await start()
    const closing = link.setSuspended(true)
    const rejected = expect(closing).rejects.toThrow('timed out')

    await vi.advanceTimersByTimeAsync(DEFINITION_STOP_MS)
    await rejected
    child.emit('error', 'FatalError', 'V8')
    expect(link.state.phase).toBe('stopping')
    child.exit()
    await Promise.resolve()
    expect(link.state).toEqual({ phase: 'idle', failure: null, pid: null })
    expect(await link.request(job)).toEqual({ kind: 'none' })
  })

  it('releases idle processes, but does not call a requested stop an unexpected crash', async () => {
    const { answer } = await start()
    const id = child.postMessage.mock.calls[0]?.[0].id

    child.emit('message', { id, ok: true, answer: { kind: 'none' } })
    await answer
    await vi.advanceTimersByTimeAsync(idleMs)
    expect(child.kill).toHaveBeenCalledOnce()
    await stop()
    expect(link.state.failure).toBeNull()
  })

  it('never starts again after shutdown, even if a queued toggle lifts the prohibition', async () => {
    await start()
    const closed = link.close()

    child.exit()
    await closed
    await link.setSuspended(false)
    expect(await link.request(job)).toEqual({ kind: 'none' })
    expect(fork).toHaveBeenCalledOnce()
  })

  it('counts the exit as saved memory even if another stop was already under way', async () => {
    await start()
    await vi.advanceTimersByTimeAsync(DEFINITION_REQUEST_MS)
    expect(link.state).toMatchObject({ phase: 'stopping', failure: 'request' })
    const closed = link.setSuspended(true)

    child.exit()
    await closed
    expect(link.state).toEqual({ phase: 'idle', pid: null, failure: null })
  })

  it('lets a question during an idle stop wait for the exit and start a fresh process', async () => {
    const { answer } = await start()
    const id = child.postMessage.mock.calls[0]?.[0].id

    child.emit('message', { id, ok: true, answer: { kind: 'none' } })
    await answer
    await vi.advanceTimersByTimeAsync(idleMs)
    expect(link.state.phase).toBe('stopping')
    const old = child

    child = new Child()
    fork.mockReturnValue(child)
    const asked = link.request(job)

    expect(fork).toHaveBeenCalledOnce()
    old.exit()
    await vi.advanceTimersByTimeAsync(0)
    expect(fork).toHaveBeenCalledTimes(2)
    child.spawn()
    const next = child.postMessage.mock.calls[0]?.[0].id

    child.emit('message', { id: next, ok: true, answer: { kind: 'needText' } })
    expect(await asked).toEqual({ kind: 'needText' })
    expect(link.state).toMatchObject({ phase: 'running', failure: null })
  })

  it('announces only real changes, not every answer of a ⌘-hover', async () => {
    const { answer } = await start()
    const changes = vi.fn()

    link.watch(changes)
    for (const [index, asked] of [answer, link.request(job)].entries()) {
      const id = child.postMessage.mock.calls[index]?.[0].id

      child.emit('message', { id, ok: true, answer: { kind: 'none' } })
      await asked
    }
    expect(changes).not.toHaveBeenCalled()
  })

  it('logs a crash with its exit code and a fatal error with its cause', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { answer } = await start()

    child.emit('exit', 139)
    await answer
    expect(warn).toHaveBeenCalledWith('[definitions] process exited unexpectedly', 139)
    child = new Child()
    fork.mockReturnValue(child)
    await start()
    child.emit('error', 'FatalError', 'V8')
    expect(warn).toHaveBeenCalledWith('[definitions] process failed', 'FatalError', 'V8')
    warn.mockRestore()
  })

  it('tells every watcher about changes until it unsubscribes', async () => {
    const first = vi.fn()
    const second = vi.fn()

    link.watch(first)
    const unwatch = link.watch(second)

    await start()
    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(first.mock.calls.length)
    unwatch()
    await stop()
    expect(first.mock.calls.length).toBeGreaterThan(second.mock.calls.length)
  })

  it('terminates a hung request and releases its pending text and timer', async () => {
    const { answer } = await start()

    await vi.advanceTimersByTimeAsync(DEFINITION_REQUEST_MS)
    expect(await answer).toContain('stopped')
    expect(child.kill).toHaveBeenCalledOnce()
    child.exit()
    await vi.advanceTimersByTimeAsync(0)
    expect(link.state).toMatchObject({ phase: 'error', failure: 'request', pid: null })
  })
})
