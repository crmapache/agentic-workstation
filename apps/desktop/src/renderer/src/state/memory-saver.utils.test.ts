import { it, expect } from 'vitest'

import type { MemorySaverState } from '@shared/memory-saver'

import {
  memorySaverAction,
  newerMemorySaverState,
  editorServicesAvailable,
} from './memory-saver.utils'

const state: MemorySaverState = {
  revision: 7,
  enabled: true,
  saved: true,
  changing: false,
  definitions: { phase: 'idle', pid: null, failure: null },
}

it('ignores delayed query and toggle responses after a newer event from another window', () => {
  expect(newerMemorySaverState(state, { ...state, revision: 6, enabled: false })).toBe(state)
  const next = { ...state, revision: 8, enabled: false }

  expect(newerMemorySaverState(state, next)).toBe(next)
  expect(newerMemorySaverState(undefined, state)).toBe(state)
})

it('blocks editor requests before load, while enabled, during changes, and after a failed stop', () => {
  expect(editorServicesAvailable(undefined)).toBe(false)
  expect(editorServicesAvailable(state)).toBe(false)
  expect(editorServicesAvailable({ ...state, enabled: false, changing: true })).toBe(false)
  expect(
    editorServicesAvailable({
      ...state,
      enabled: false,
      definitions: { phase: 'error', pid: 1, failure: 'stop' },
    }),
  ).toBe(false)
  expect(editorServicesAvailable({ ...state, enabled: false })).toBe(true)
})

it('keeps navigation while the service restarts on its own after idle time or a failure', () => {
  for (const failure of [null, 'request'] as const) {
    expect(
      editorServicesAvailable({
        ...state,
        enabled: false,
        definitions: { phase: 'stopping', pid: 1, failure },
      }),
    ).toBe(true)
  }
})

it('repeats the current choice after a failed stop, otherwise switches modes', () => {
  const stuck = { phase: 'error', pid: 1, failure: 'stop' } as const

  expect(memorySaverAction({ ...state, definitions: stuck })).toBe('retry')
  expect(memorySaverAction({ ...state, enabled: false, definitions: stuck })).toBe('retry')
  // Запись может падать раз за разом (диск полон): повтор запер бы режим до перезапуска IDE.
  expect(memorySaverAction({ ...state, saved: false })).toBe('toggle')
  expect(memorySaverAction(state)).toBe('toggle')
  expect(
    memorySaverAction({
      ...state,
      enabled: false,
      definitions: { phase: 'error', pid: null, failure: 'request' },
    }),
  ).toBe('toggle')
  expect(memorySaverAction(state, 'retry')).toBe('retry')
  expect(memorySaverAction({ ...state, definitions: stuck }, 'toggle')).toBe('retry')
})
