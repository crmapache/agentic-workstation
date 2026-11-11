import { it, expect, describe } from 'vitest'

import type { Route } from './routes'
import { parentOf, routePath, parseRoute } from './routes'

const AGENT = 'AAAAAAAAAAAAAAAAAAAAAA'

const PROJECT = 'p-BBBBBBBBBBBBBBBBBBBBBB'

const ROUTES: Route[] = [
  { name: 'machines' },
  { name: 'pair' },
  { name: 'project', agentId: AGENT, projectKey: PROJECT },
  { name: 'newConversation', agentId: AGENT, projectKey: PROJECT },
  { name: 'startScenario', agentId: AGENT, projectKey: PROJECT },
  {
    name: 'conversation',
    agentId: AGENT,
    projectKey: PROJECT,
    conversationId: '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
  },
  { name: 'queue', agentId: AGENT, projectKey: PROJECT, queueId: 'q_1' },
  { name: 'run', agentId: AGENT, projectKey: PROJECT, runId: 'r-1' },
]

describe('адреса экранов', () => {
  it('адрес и разбор сходятся для каждого экрана', () => {
    for (const route of ROUTES) expect(parseRoute(routePath(route))).toEqual(route)
  })

  it('незнакомое и кривое - notFound, хвостовая косая черта не мешает', () => {
    expect(parseRoute('/m/../etc')).toEqual({ name: 'notFound' })
    expect(parseRoute('/m/a b/p/c')).toEqual({ name: 'notFound' })
    expect(parseRoute('/pair/')).toEqual({ name: 'pair' })
  })

  it('назад с открытого по ссылке экрана - к проекту, с проекта - к машинам', () => {
    expect(parentOf(ROUTES[6] as Route)).toEqual({
      name: 'project',
      agentId: AGENT,
      projectKey: PROJECT,
    })
    expect(parentOf(ROUTES[2] as Route)).toEqual({ name: 'machines' })
  })
})
