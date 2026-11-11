import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach } from 'vitest'

import {
  releaseHead,
  RELEASED_FRAME,
  releasedBriefing,
  loadReleasedHeads,
  RELEASED_BRIEFING,
  takeReleasedFrame,
} from './released-heads'

let dir = ''

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('released scenario heads', () => {
  it('briefs every process of a released head and frames only its first message', async () => {
    dir = await mkdtemp(join(tmpdir(), 'released-'))
    await loadReleasedHeads(join(dir, 'released.json'))

    expect(releasedBriefing('head-1')).toBe('')
    expect(takeReleasedFrame('head-1')).toBe('')

    releaseHead('head-1')

    expect(releasedBriefing('head-1')).toBe(RELEASED_BRIEFING)
    expect(RELEASED_BRIEFING).not.toMatch(/["\n]/)
    expect(takeReleasedFrame('head-1')).toBe(RELEASED_FRAME)
    expect(takeReleasedFrame('head-1')).toBe('')
    await new Promise((resolve) => setTimeout(resolve, 50))

    const stored = JSON.parse(await readFile(join(dir, 'released.json'), 'utf8')) as {
      released: string[]
      framed: string[]
    }

    expect(stored).toEqual({ released: ['head-1'], framed: ['head-1'] })
  })
})
