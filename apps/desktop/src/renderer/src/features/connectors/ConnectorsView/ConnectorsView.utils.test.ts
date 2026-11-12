import { it, expect, describe } from 'vitest'

import { CUSTOM_KINDS, CONNECTOR_KINDS } from '@shared/connectors'

import { APP_KINDS, EMPTY_ADD_FIELDS } from './ConnectorsView.constants'
import {
  addRequest,
  toolGroups,
  connectionsOf,
  isForeignHost,
  connectorNames,
  connectorTitle,
  connectorDetail,
  shortDescription,
  forgottenProjects,
  signsInWithBrowser,
  availabilitySummary,
} from './ConnectorsView.utils'

const tool = (name: string, access: 'read' | 'write' | 'outbound') => ({
  name,
  access,
  description: '',
  enabled: true,
})

describe('toolGroups', () => {
  it('чтение, запись, отправка - по порядку, без пустых групп', () => {
    const groups = toolGroups([tool('send', 'outbound'), tool('list', 'read')])

    expect(groups.map((group) => group.access)).toEqual(['read', 'outbound'])
  })
})

describe('shortDescription', () => {
  it('первое предложение первой строки', () => {
    expect(shortDescription('Search pages. Returns ids.\nMore text')).toBe('Search pages.')
    expect(shortDescription('No period here')).toBe('No period here')
  })

  it('длинное режется с многоточием', () => {
    const text = 'x'.repeat(300)

    expect(shortDescription(text)).toHaveLength(140)
    expect(shortDescription(text).endsWith('…')).toBe(true)
  })
})

describe('forgottenProjects', () => {
  it('пути из доступности, которых нет среди известных проектов, - без повторов', () => {
    const connectors = [
      { availability: { mode: 'all' as const } },
      { availability: { mode: 'only' as const, projects: ['/p/old', '/p/a'] } },
      { availability: { mode: 'only' as const, projects: ['/p/old', '/p/gone'] } },
    ]

    expect(forgottenProjects(connectors, [{ rootPath: '/p/a' }])).toEqual(['/p/old', '/p/gone'])
  })
})

describe('isForeignHost', () => {
  it('API на сайте документации - своё, на другом сайте - повод проверить', () => {
    expect(isForeignHost('https://api.todoist.com/rest/v2', 'https://developer.todoist.com')).toBe(
      false,
    )
    expect(isForeignHost('https://api.bbc.co.uk/v1', 'https://docs.bbc.co.uk')).toBe(false)
    expect(isForeignHost('https://evil.dev/api', 'https://developer.todoist.com')).toBe(true)
    expect(isForeignHost('https://evil.dev/api', '')).toBe(false)
  })
})

describe('availabilitySummary', () => {
  const projects = [{ name: 'web-tanks', rootPath: '/p/web-tanks' }]

  it('везде, только в одном - по имени, только в нескольких, нигде', () => {
    expect(availabilitySummary({ mode: 'all' }, projects).key).toBe('all')
    expect(availabilitySummary({ mode: 'only', projects: ['/p/web-tanks'] }, projects)).toEqual({
      key: 'onlyOne',
      count: 1,
      name: 'web-tanks',
    })
    expect(availabilitySummary({ mode: 'only', projects: ['/p/gone'] }, [])).toMatchObject({
      name: 'gone',
    })
    expect(availabilitySummary({ mode: 'only', projects: [] }, projects).key).toBe('none')
  })
})

describe('connectorDetail', () => {
  it('почта, хост адреса, команда - что есть первым', () => {
    const base = { account: null, url: null, command: null }

    expect(connectorDetail({ ...base, account: 'me@work.com' })).toBe('me@work.com')
    expect(connectorDetail({ ...base, url: 'https://snakein.com/api/mcp' })).toBe('snakein.com')
    expect(connectorDetail({ ...base, command: 'node x.js' })).toBe('node x.js')
  })
})

describe('connectorNames', () => {
  it('встроенный: имя типа заголовком, подпись под ним; совпадающая подпись не повторяется', () => {
    expect(connectorNames({ name: null, label: 'Work' }, 'Notion')).toEqual({
      title: 'Notion',
      second: 'Work',
    })
    expect(connectorNames({ name: null, label: 'slack' }, 'Slack')).toEqual({
      title: 'Slack',
      second: '',
    })
  })

  it('свой тип - по своему имени; «один раз» - без подписи', () => {
    expect(connectorNames({ name: 'Playwright', label: '1' }, 'MCP')).toEqual({
      title: 'Playwright',
      second: '1',
    })
    expect(connectorTitle({ name: 'Chatkepr', label: '' }, 'MCP')).toBe('Chatkepr')
    expect(connectorTitle({ name: null, label: 'Main' }, 'Gmail')).toBe('Gmail · Main')
  })
})

describe('connectionsOf', () => {
  it('считает подключения своего типа', () => {
    const connectors = [{ typeId: 't' }, { typeId: 't' }, { typeId: null }] as never[]

    expect(connectionsOf({ connectors }, 't')).toBe(2)
  })
})

describe('группы каталога', () => {
  it('каждый тип - ровно в одной группе', () => {
    expect([...APP_KINDS, ...CUSTOM_KINDS].toSorted()).toEqual([...CONNECTOR_KINDS].toSorted())
  })
})

describe('браузер для ИИ', () => {
  it('добавляется без подписи и без входа в браузере', () => {
    expect(addRequest('browser', { ...EMPTY_ADD_FIELDS, label: 'ignored' })).toEqual({
      kind: 'browser',
    })
    expect(signsInWithBrowser('browser', EMPTY_ADD_FIELDS)).toBe(false)
  })
})
