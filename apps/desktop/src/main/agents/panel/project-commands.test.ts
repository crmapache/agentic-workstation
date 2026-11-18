import { it, vi, expect, describe } from 'vitest'

import { ProjectCommands } from './project-commands'

const command = (name: string, description = '') => ({ name, description, argumentHint: '' })

describe('команды проекта', () => {
  it('с диска - имена без пояснений; на диск - только имена', () => {
    const commands = new ProjectCommands({ '/p': ['compact'] }, () => undefined)

    expect(commands.of('/p')).toEqual([command('compact')])
    expect(commands.of('/other')).toEqual([])

    commands.set('/p', [command('compact', 'Free up context')])

    expect(commands.stored()).toEqual({ '/p': ['compact'] })
  })

  it('на диск пишется, только когда поменялись имена, а не пояснения', () => {
    const onChange = vi.fn()
    const commands = new ProjectCommands({ '/p': ['compact'] }, onChange)

    commands.set('/p', [command('compact', 'Free up context')])
    commands.set('/p', [command('compact'), command('clear')])

    expect(onChange.mock.calls).toEqual([[false], [true]])
  })
})
