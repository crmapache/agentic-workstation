import { it, expect, describe } from 'vitest'

import type { DraftToken } from '@shared/message-draft'
import type { CommandEntry } from '@shared/slash-catalog'

import {
  commandChip,
  localCommand,
  argumentQuery,
  captureCommand,
  captureWrittenCommand,
} from './slash-capture.utils'
import {
  chosenRow,
  enterSends,
  slashQuery,
  matchCommands,
  commandNameBeforeArgument,
} from './slash.utils'

const entry = (id: string, group: CommandEntry['group'] = 'project'): CommandEntry => ({
  id,
  hint: '',
  group,
})

describe('каталог команд', () => {
  it('сначала начинающиеся с запроса, потом содержащие; выбор держится за имя', () => {
    const list = [entry('task-review'), entry('review'), entry('task')]

    expect(matchCommands(list, 'task').map((command) => command.id)).toEqual([
      'task-review',
      'task',
    ])
    expect(chosenRow(list, { id: 'task', list: '/t', by: 'key' }, '/t')).toBe(2)
    expect(chosenRow(list, { id: 'gone', list: '/t', by: 'key' }, '/t')).toBe(0)
    expect(chosenRow(list, { id: 'task', list: '/other', by: 'key' }, '/t')).toBe(0)
  })

  it('Enter отправляет набранное целиком, но стрелка важнее, а мышь - нет', () => {
    expect(enterSends(true, null, '/task')).toBe(true)
    expect(enterSends(true, { id: 'task-review', list: '/task', by: 'key' }, '/task')).toBe(false)
    expect(enterSends(true, { id: 'task-review', list: '/task', by: 'pointer' }, '/task')).toBe(
      true,
    )
    expect(enterSends(false, null, '/ta')).toBe(false)
  })

  it('запрос - до пробела, имя перед пустым аргументом - для серого синтаксиса', () => {
    expect(slashQuery('/comp')).toBe('comp')
    expect(slashQuery('/compact now')).toBeNull()
    expect(slashQuery('say /x')).toBeNull()
    expect(commandNameBeforeArgument('/code-review ')).toBe('code-review')
    expect(commandNameBeforeArgument('/code-review high')).toBeNull()
  })
})

describe('команда в черновике', () => {
  const commands = [entry('compact'), entry('model', 'built-in')]

  it('знакомое имя с пробелом - чип, текст после каретки остаётся', () => {
    const tokens: DraftToken[] = [{ kind: 'text', value: '/compact keep this' }]

    expect(captureCommand(tokens, commands, '/compact ')).toEqual([
      { kind: 'chip', chip: { kind: 'cmd', value: 'compact' } },
      { kind: 'text', value: ' ' },
      { kind: 'text', value: 'keep this' },
    ])
    expect(captureCommand(tokens, commands, '/nope ')).toBeNull()
  })

  it('пришедшая целиком команда - тоже чип', () => {
    expect(captureWrittenCommand([{ kind: 'text', value: '/compact' }], commands)).toEqual([
      { kind: 'chip', chip: { kind: 'cmd', value: 'compact' } },
      { kind: 'text', value: ' ' },
    ])
    expect(commandChip([{ kind: 'chip', chip: { kind: 'cmd', value: 'model' } }])).toBe('model')
  })

  it('/model со знакомым значением и команды панели выполняет панель', () => {
    const sets = { model: [{ id: 'opus', hint: '' }], effort: [{ id: 'high', hint: '' }] }
    const panel = new Set(['resume', 'config'])

    expect(argumentQuery('/model op', sets)).toEqual({
      command: 'model',
      query: 'op',
      options: sets.model,
    })
    expect(localCommand('/model opus', panel, sets)).toEqual({ name: 'model', argument: 'opus' })
    expect(localCommand('/model gpt', panel, sets)).toBeNull()
    expect(localCommand('/resume', panel, sets)).toEqual({ name: 'resume', argument: '' })
    expect(localCommand('/config theme=dark', panel, sets)).toBeNull()
    expect(localCommand('/fast on', panel, sets)).toBeNull()
  })
})
