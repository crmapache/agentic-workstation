import { it, expect, describe } from 'vitest'

import type { RunNoteWire } from '@agentic-workstation/remote-protocol/wire-types'

import { lastTold } from './RunScreen.utils'

describe('последние слова голове', () => {
  const note = (who: string, at: number): RunNoteWire => ({ at, stepKey: '', text: '', who })

  it('последняя заметка человека, голова и IDE не в счёт', () => {
    expect(lastTold([note('person', 1), note('head', 3), note('person', 2)])?.at).toBe(2)
    expect(lastTold([note('head', 1)])).toBeNull()
  })
})
