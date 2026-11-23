import { it, expect, describe } from 'vitest'

import type { SlashCommandWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import { slashQuery, slashState, localCommand, matchCommands } from './slash.utils'

const command = (name: string, hint = ''): SlashCommandWire => ({
  name,
  hint,
  argumentHint: '',
  group: 'project',
})

const COMMANDS = [command('task-review', 'review a task'), command('review'), command('task')]

const SETS = {
  model: [
    { value: 'default', hint: 'as in settings' },
    { value: 'opus', hint: 'Opus' },
    { value: 'sonnet', hint: 'Sonnet' },
  ],
}

describe('подсказка «/» телефона', () => {
  it('команда читается только с начала и до пробела', () => {
    expect(slashQuery('/rev')).toBe('rev')
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/review now')).toBeNull()
    expect(slashQuery('hi /review')).toBeNull()
  })

  it('сначала начинающиеся с набранного, потом содержащие', () => {
    expect(matchCommands(COMMANDS, 'task').map((one) => one.name)).toEqual(['task-review', 'task'])
    expect(matchCommands(COMMANDS, 'view').map((one) => one.name)).toEqual([
      'task-review',
      'review',
    ])
  })

  it('команды: подпись со «/», пояснение, подсветка набранного, сколько из скольких', () => {
    const state = slashState('/rev', COMMANDS, SETS)

    expect(state).toMatchObject({ kind: 'commands', total: 3, key: '/rev' })
    expect(state?.rows.map((row) => [row.label, row.marks])).toEqual([
      ['/review', [{ start: 1, length: 3 }]],
      ['/task-review', [{ start: 6, length: 3 }]],
    ])
    expect(state?.rows[1]?.description).toBe('review a task')
  })

  it('после имени и пробела - значения аргумента; у команды без значений - ничего', () => {
    expect(slashState('/model ', COMMANDS, SETS)).toMatchObject({
      kind: 'values',
      command: 'model',
      total: 3,
      key: 'model\u0000',
    })
    expect(slashState('/model so', COMMANDS, SETS)?.rows.map((row) => row.id)).toEqual(['sonnet'])
    expect(slashState('/review ', COMMANDS, SETS)).toBeNull()
    expect(slashState('/nothing', COMMANDS, SETS)).toBeNull()
  })

  it('своя команда телефона - имя и аргумент; вопрос сбоку держит переводы строк', () => {
    const local = new Set(['btw', 'model'])

    expect(localCommand('/model  opus ', local)).toEqual({ name: 'model', argument: 'opus' })
    expect(localCommand('/btw why?\nand how', local)).toEqual({
      name: 'btw',
      argument: 'why?\nand how',
    })
    expect(localCommand('/btw', local)).toEqual({ name: 'btw', argument: '' })
    expect(localCommand('/review this', local)).toBeNull()
    expect(localCommand('tell me /model', local)).toBeNull()
  })
})
