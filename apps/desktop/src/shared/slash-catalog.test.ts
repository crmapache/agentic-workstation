import { it, expect, describe } from 'vitest'

import type { CommandEntry } from './slash-catalog'
import { withBuiltins, buildCommands } from './slash-catalog'

const entry = (id: string, group: CommandEntry['group'] = 'project'): CommandEntry => ({
  id,
  hint: '',
  group,
})

describe('каталог команд', () => {
  it('панель, встроенные, CLI, потом диск по имени; повторы и недоступные - мимо', () => {
    const commands = buildCommands(
      [entry('resume', 'panel')],
      [{ id: 'model', hint: 'switch', group: 'built-in' }],
      [
        { name: 'compact', description: 'squash', argumentHint: '' },
        { name: 'status', description: '', argumentHint: '' },
        { name: 'resume', description: '', argumentHint: '' },
      ],
      [
        { name: 'zeta', description: 'z', argumentHint: '' },
        { name: 'alpha', description: 'a', argumentHint: '<x>' },
        { name: 'model', description: 'from disk', argumentHint: '' },
      ],
    )

    expect(commands.map((command) => command.id)).toEqual([
      'resume',
      'model',
      'compact',
      'alpha',
      'zeta',
    ])
    expect(commands[1]?.hint).toBe('from disk')
    expect(commands[3]?.argumentHint).toBe('<x>')
  })

  it('свои команды CLI видны до первого хода - встроенными, служебные и серверные - нет', () => {
    const builtins = [
      { name: 'compact', description: 'Free up context', argumentHint: '', builtin: true },
      { name: 'clear', description: 'Start a new session', argumentHint: '', builtin: true },
      { name: '__remote-workflow', description: 'server', argumentHint: '', builtin: true },
      { name: 'workflow-launch-exec', description: 'server', argumentHint: '', builtin: true },
    ]
    const commands = buildCommands([], [], withBuiltins([], builtins), [])

    expect(commands).toEqual([
      { id: 'compact', hint: 'Free up context', argumentHint: undefined, group: 'built-in' },
      { id: 'clear', hint: 'Start a new session', argumentHint: undefined, group: 'built-in' },
    ])
  })

  it('список проекта - в порядке CLI, имя без пояснения берёт его у своей команды CLI', () => {
    const merged = withBuiltins(
      [
        { name: 'my-skill', description: 'mine', argumentHint: '' },
        { name: 'compact', description: '', argumentHint: '' },
      ],
      [
        { name: 'clear', description: 'Start a new session', argumentHint: '', builtin: true },
        { name: 'compact', description: 'Free up context', argumentHint: '', builtin: true },
      ],
    )

    expect(merged.map((command) => [command.name, command.description])).toEqual([
      ['my-skill', 'mine'],
      ['compact', 'Free up context'],
      ['clear', 'Start a new session'],
    ])
  })
})
