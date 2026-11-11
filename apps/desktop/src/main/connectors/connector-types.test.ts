import { it, expect, describe } from 'vitest'

import type { StoredType, StoredConnector } from './connector-store'
import { blankConnector } from './connector-store'
import { typeView, planTypes, titleName, capitalized, typeServerName } from './connector-types'

const command = (id: string, serverName: string, args: string[]): StoredConnector => ({
  ...blankConnector({ id, kind: 'command', label: serverName, serverName }),
  command: { command: 'npx', args, cwd: null },
})

const playwright = ['-y', '@playwright/mcp@latest', '--isolated', '--headless']

describe('имена своих типов', () => {
  it('с заглавной, без лишних пробелов; GitHub остаётся GitHub', () => {
    expect(capitalized('  playwright   web ')).toBe('Playwright web')
    expect(capitalized('GitHub')).toBe('GitHub')
    expect(titleName('notion-web')).toBe('Notion Web')
    expect(titleName('chatkepr')).toBe('Chatkepr')
  })

  it('имя сервера: начало и подпись у «несколько раз», одно начало у «один раз»', () => {
    expect(typeServerName({ serverBase: 'playwright', multiple: true }, 'Work 2')).toBe(
      'playwright-work-2',
    )
    expect(typeServerName({ serverBase: 'playwright', multiple: true }, 'Пётр')).toBeNull()
    expect(typeServerName({ serverBase: 'chatkepr', multiple: false }, '')).toBe('chatkepr')
  })
})

describe('planTypes', () => {
  const ids = () => {
    let next = 0

    return () => `t${++next}`
  }

  it('одинаковые playwright-1 и -2 - один тип «несколько раз», остальные - сами по себе', () => {
    const loose = [
      command('a', 'playwright-1', playwright),
      command('b', 'playwright-2', playwright),
      command('c', 'notion-web', ['-y', '@playwright/mcp@0.0.78', '--headless']),
      command('d', 'chatkepr', ['/x/index.js']),
    ]
    const plan = planTypes(loose, (item) => JSON.stringify(item.command), ids())

    expect(
      plan.types.map(({ id, name, multiple, serverBase }) => ({ id, name, multiple, serverBase })),
    ).toEqual([
      { id: 't1', name: 'Playwright', multiple: true, serverBase: 'playwright' },
      { id: 't2', name: 'Notion Web', multiple: false, serverBase: 'notion-web' },
      { id: 't3', name: 'Chatkepr', multiple: false, serverBase: 'chatkepr' },
    ])
    expect(Object.fromEntries(plan.patches)).toEqual({
      a: { typeId: 't1', label: '1' },
      b: { typeId: 't1', label: '2' },
      c: { typeId: 't2', label: '' },
      d: { typeId: 't3', label: '' },
    })
    expect(Object.fromEntries(plan.secretsFrom)).toEqual({ t1: 'a', t2: 'c', t3: 'd' })
    expect(plan.types[0]?.command).toEqual({ command: 'npx', args: playwright, cwd: null })
  })

  it('разные команды с одним началом не сливаются: каждая - свой тип', () => {
    const loose = [command('a', 'tool-a', ['a.js']), command('b', 'tool-b', ['b.js'])]
    const plan = planTypes(loose, (item) => JSON.stringify(item.command), ids())

    expect(plan.types.map((type) => [type.name, type.multiple])).toEqual([
      ['Tool A', false],
      ['Tool B', false],
    ])
  })

  it('одно подключение с номером - тип «один раз» по своей подписи', () => {
    const plan = planTypes([command('a', 'playwright-1', playwright)], () => 'x', ids())

    expect(plan.types[0]).toMatchObject({
      name: 'Playwright 1',
      multiple: false,
      serverBase: 'playwright-1',
    })
    expect(plan.patches.get('a')).toEqual({ typeId: 't1', label: '' })
  })
})

describe('typeView', () => {
  const type: StoredType = {
    id: 't1',
    kind: 'command',
    name: 'Tool',
    multiple: true,
    serverBase: 'tool',
    url: null,
    auth: null,
    transport: null,
    command: { command: 'node', args: ['x.js', '--api-key', '•••'], cwd: null },
    spec: null,
  }

  it('команда - строкой, вход команды не нужен; адрес - хостом и способом входа', () => {
    expect(typeView(type)).toEqual({
      id: 't1',
      kind: 'command',
      name: 'Tool',
      multiple: true,
      detail: 'node x.js --api-key •••',
      signIn: 'none',
    })
    expect(
      typeView({
        ...type,
        kind: 'mcp',
        command: null,
        url: 'https://mcp.linear.app/mcp',
        auth: 'token',
      }),
    ).toMatchObject({ detail: 'mcp.linear.app', signIn: 'token' })
  })
})
