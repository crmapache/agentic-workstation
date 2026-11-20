import { it, vi, expect, describe } from 'vitest'

import type { MemorySaverState } from '@shared/memory-saver'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { memorySaverQuery, editorServicesQuery } from './memory-saver.queries'
import { QUERY_KEYS } from './query-keys'

vi.mock('../lib/ipc', () => ({ invoke: vi.fn() }))

const state = (revision: number, patch: Partial<MemorySaverState> = {}): MemorySaverState => ({
  revision,
  enabled: false,
  saved: true,
  changing: false,
  definitions: { phase: 'idle', pid: null, failure: null },
  ...patch,
})

describe('memory saver queries', () => {
  it('wakes editors only when navigation availability flips', () => {
    const client = new QueryClient()

    client.setQueryData(QUERY_KEYS.memorySaver, state(1))
    // Компонент читает только data - как useQuery с отслеживанием полей.
    const observer = new QueryObserver(client, {
      ...editorServicesQuery,
      notifyOnChangeProps: ['data'],
    })
    const seen: unknown[] = []
    const stop = observer.subscribe((result) => seen.push(result.data))
    const running = { phase: 'running', pid: 7, failure: null } as const

    client.setQueryData(QUERY_KEYS.memorySaver, state(2, { definitions: running }))
    client.setQueryData(QUERY_KEYS.memorySaver, state(3))
    client.setQueryData(QUERY_KEYS.memorySaver, state(4, { enabled: true }))
    stop()
    expect(seen).toEqual([false])
  })

  it('keeps a newer event that arrived while the snapshot was on its way', async () => {
    const client = new QueryClient()
    const newer = state(5, { enabled: true })

    vi.mocked(invoke).mockImplementationOnce(() => {
      client.setQueryData(QUERY_KEYS.memorySaver, newer)

      return Promise.resolve(state(3))
    })
    expect(await client.query(memorySaverQuery)).toEqual(newer)
  })
})
