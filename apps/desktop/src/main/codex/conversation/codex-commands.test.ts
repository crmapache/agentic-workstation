import { it, expect, describe } from 'vitest'

import { commandOf, skillsFromList } from './codex-commands'

const skills = skillsFromList({
  data: [
    {
      cwd: '/p',
      skills: [
        { name: 'use-railway', description: 'Railway', path: '/s/railway', enabled: true },
        { name: 'off', description: '', path: '/s/off', enabled: false },
      ],
      errors: [],
    },
  ],
})

describe('команды Codex в поле', () => {
  it('сжатие, ревью со словами и без, навык по имени; прочее - обычное сообщение', () => {
    expect(commandOf('/compact', skills)).toEqual({ kind: 'compact' })
    expect(commandOf('/review', skills)).toEqual({ kind: 'review', instructions: '' })
    expect(commandOf('/review only the API layer', skills)).toEqual({
      kind: 'review',
      instructions: 'only the API layer',
    })
    expect(commandOf('/use-railway deploy it', skills)).toEqual({
      kind: 'skill',
      skill: { name: 'use-railway', path: '/s/railway', description: 'Railway' },
      rest: 'deploy it',
    })
    expect(commandOf('/off', skills)).toBeNull()
    expect(commandOf('plain text', skills)).toBeNull()
  })
})
