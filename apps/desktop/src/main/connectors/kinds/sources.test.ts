import { it, expect, describe } from 'vitest'

import { blankConnector } from '../connector-store'
import { hasSignIn, remoteUrlOf, signsInWithBrowser } from './sources'

const connector = (kind: 'atlassian' | 'todoist' | 'notion', auth: 'token' | null = null) => ({
  ...blankConnector({ id: kind, kind, label: 'Work', serverName: `${kind}-work` }),
  auth,
})

describe('встроенные коннекторы с официальным MCP', () => {
  it('адрес - официальный сервер типа', () => {
    expect(remoteUrlOf(connector('atlassian'), {})).toBe('https://mcp.atlassian.com/v1/mcp')
    expect(remoteUrlOf(connector('todoist', 'token'), {})).toBe('https://ai.todoist.net/mcp')
  })

  it('Jira & Confluence входит в браузере, Todoist - по токену', () => {
    expect(signsInWithBrowser(connector('atlassian'))).toBe(true)
    expect(signsInWithBrowser(connector('notion'))).toBe(true)
    expect(signsInWithBrowser(connector('todoist', 'token'))).toBe(false)
    expect(hasSignIn(connector('todoist', 'token'), {})).toBe(false)
    expect(hasSignIn(connector('todoist', 'token'), { bearer: 't' })).toBe(true)
  })
})
