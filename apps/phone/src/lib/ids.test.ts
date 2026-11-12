import { it, expect, describe } from 'vitest'

import { ID } from '@agentic-workstation/remote-protocol/command-fields'

import { newId } from './ids'

describe('id, которые называет телефон', () => {
  it('проходят ID протокола и не повторяются', () => {
    const ids = Array.from({ length: 50 }, newId)

    for (const id of ids) expect(ID.safeParse(id).success).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
