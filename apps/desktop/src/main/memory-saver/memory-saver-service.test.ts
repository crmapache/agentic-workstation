import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, describe, afterEach } from 'vitest'

import type { MemorySaverPrefs, MemorySaverState, EditorServiceState } from '@shared/memory-saver'

import { JsonFile } from '../storage/json-file'
import { MemorySaverService } from './memory-saver-service'

const folders: string[] = []

const setup = async (enabled = false) => {
  const folder = await mkdtemp(join(tmpdir(), 'memory-saver-'))

  folders.push(folder)
  const file = new JsonFile<MemorySaverPrefs>(join(folder, 'memory-saver.json'))

  await file.write({ enabled })
  const watchers = new Set<() => void>()
  const definitions = {
    state: { phase: 'idle', pid: null, failure: null } as EditorServiceState,
    setSuspended: vi.fn((_enabled: boolean) => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    watch: (listener: () => void) => {
      watchers.add(listener)

      return () => void watchers.delete(listener)
    },
    /** Служба сама сменила фазу - как DefinitionLink после exit. */
    notify: () => {
      for (const watcher of watchers) watcher()
    },
  }
  const changes: MemorySaverState[] = []
  const service = await MemorySaverService.load(file, definitions, (state) => changes.push(state))

  return { file, definitions, changes, service }
}

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

describe('MemorySaverService', () => {
  it('loads the persisted choice before permitting any editor work', async () => {
    const { service, definitions } = await setup(true)

    expect(definitions.setSuspended.mock.calls).toEqual([[true]])
    expect(service.state).toMatchObject({ enabled: true, saved: true, changing: false })
  })

  it('serializes rapid toggles from several windows and persists their final choice', async () => {
    const { service, file, definitions, changes } = await setup()
    const result = await Promise.all(Array.from({ length: 9 }, () => service.toggle()))

    expect(result.map((state) => state.enabled)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ])
    expect(await file.read()).toEqual({ enabled: true })
    expect(definitions.setSuspended.mock.calls.map(([enabled]) => enabled)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ])
    expect(
      changes.every(
        (state, index) => index === 0 || state.revision > (changes[index - 1]?.revision ?? 0),
      ),
    ).toBe(true)
    const restored = await MemorySaverService.load(file, definitions, () => undefined)

    expect(restored.state.enabled).toBe(true)
  })

  it('does not announce success before actual process termination', async () => {
    const { service, definitions, changes } = await setup()
    let release: () => void = () => undefined

    definitions.setSuspended.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const result = service.toggle()

    await Promise.resolve()
    expect(service.state).toMatchObject({ enabled: true, changing: true })
    expect(changes.at(-1)?.changing).toBe(true)
    release()
    expect(await result).toMatchObject({ enabled: true, changing: false, saved: true })
  })

  it('keeps the requested prohibition after stop failure and exposes the live process', async () => {
    const { service, definitions, file } = await setup()

    definitions.setSuspended.mockImplementationOnce(() => {
      definitions.state = { phase: 'error', pid: 42, failure: 'stop' }
      definitions.notify()

      return Promise.reject(new Error('kill failed'))
    })
    expect(await service.toggle()).toMatchObject({
      enabled: true,
      changing: false,
      saved: true,
      definitions: { phase: 'error', pid: 42, failure: 'stop' },
    })
    expect(await file.read()).toEqual({ enabled: true })
  })

  it('retries the current choice after a failed stop instead of switching modes', async () => {
    const { service, definitions } = await setup()

    definitions.setSuspended.mockRejectedValueOnce(new Error('kill failed'))
    expect(await service.toggle()).toMatchObject({ enabled: true, changing: false })
    expect(await service.retry()).toMatchObject({ enabled: true, changing: false })
    expect(definitions.setSuspended.mock.calls.map(([enabled]) => enabled)).toEqual([
      false,
      true,
      true,
    ])
  })

  it('retries saving without switching modes', async () => {
    const { service, file } = await setup()

    vi.spyOn(file, 'write').mockRejectedValueOnce(new Error('disk full'))
    expect(await service.toggle()).toMatchObject({ enabled: true, saved: false })
    expect(await service.retry()).toMatchObject({ enabled: true, saved: true })
    expect(await file.read()).toEqual({ enabled: true })
  })

  it('still stops editor work if saving fails and reports that choice was not persisted', async () => {
    const { service, definitions, file } = await setup()

    vi.spyOn(file, 'write').mockRejectedValueOnce(new Error('disk full'))
    expect(await service.toggle()).toMatchObject({ enabled: true, saved: false, changing: false })
    expect(definitions.setSuspended).toHaveBeenLastCalledWith(true)
    expect(await service.toggle()).toMatchObject({ enabled: false, saved: true })
  })

  it('broadcasts late exits and startup failures even when no toggle is pending', async () => {
    const { service, definitions, changes } = await setup()

    definitions.state = { phase: 'error', failure: 'start', pid: null }
    definitions.notify()
    expect(changes.at(-1)).toEqual(service.state)
    definitions.state = { phase: 'idle', failure: null, pid: null }
    definitions.notify()
    expect(changes.at(-1)?.definitions.failure).toBeNull()
  })

  it('settles pending persistence and blocks requests on shutdown without changing the preference', async () => {
    const { service, definitions, file } = await setup()
    const toggled = service.toggle()

    await service.close()
    await toggled
    await service.toggle()
    expect(await file.read()).toEqual({ enabled: true })
    expect(definitions.close).toHaveBeenCalledOnce()
  })

  it('forbids editor work at once on shutdown without waiting for a pending toggle', async () => {
    const { service, definitions } = await setup(true)
    let release: () => void = () => undefined

    definitions.setSuspended.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const toggled = service.toggle()

    await Promise.resolve()
    expect(definitions.setSuspended).toHaveBeenLastCalledWith(false)
    const closed = service.close()

    expect(definitions.close).toHaveBeenCalledOnce()
    release()
    await Promise.all([toggled, closed])
  })
})
