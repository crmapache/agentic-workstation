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
  { name: 'board', agentId: AGENT },
  { name: 'history', agentId: AGENT, projectKey: PROJECT },
  { name: 'accounts', agentId: AGENT },
  { name: 'connectors', agentId: AGENT },
  { name: 'search', agentId: AGENT, projectKey: PROJECT },
  { name: 'scenarios', agentId: AGENT, projectKey: PROJECT },
  { name: 'draft', agentId: AGENT, projectKey: PROJECT },
  { name: 'scenario', agentId: AGENT, projectKey: PROJECT, scope: 'user', scenarioId: 'tidy_up' },
  { name: 'schedule', agentId: AGENT, projectKey: PROJECT, scope: 'project', scenarioId: 'tidy' },
  { name: 'startScenario', agentId: AGENT, projectKey: PROJECT, scenario: 'user:tidy-up' },
  { name: 'stepLog', agentId: AGENT, projectKey: PROJECT, runId: 'r-1', stepKey: 'build:card-2:3' },
  { name: 'stepLog', agentId: AGENT, projectKey: PROJECT, runId: 'r-1', stepKey: 'head' },
]

describe('адреса экранов', () => {
  it('адрес и разбор сходятся для каждого экрана', () => {
    for (const route of ROUTES) expect(parseRoute(routePath(route))).toEqual(route)
  })

  it('незнакомое и кривое - notFound, хвостовая косая черта не мешает', () => {
    expect(parseRoute('/m/../etc')).toEqual({ name: 'notFound' })
    expect(parseRoute('/m/a b/p/c')).toEqual({ name: 'notFound' })
    expect(parseRoute('/pair/')).toEqual({ name: 'pair' })
    // Полка - только проектная или личная; ключ шага с кривым кодом или длиннее протокола - нет.
    expect(parseRoute(`/m/${AGENT}/p/${PROJECT}/s/team/tidy`)).toEqual({ name: 'notFound' })
    expect(parseRoute(`/m/${AGENT}/p/${PROJECT}/r/r-1/log/%E0%A4`)).toEqual({ name: 'notFound' })
    expect(parseRoute(`/m/${AGENT}/p/${PROJECT}/r/r-1/log/${'a'.repeat(201)}`)).toEqual({
      name: 'notFound',
    })
  })

  it('ключ шага в адресе закодирован: двоеточия не ломают адрес', () => {
    const path = routePath({
      name: 'stepLog',
      agentId: AGENT,
      projectKey: PROJECT,
      runId: 'r-1',
      stepKey: 'build:card:1',
    })

    expect(path).toBe(`/m/${AGENT}/p/${PROJECT}/r/r-1/log/build%3Acard%3A1`)
  })

  it('назад с открытого по ссылке экрана - к проекту, с проекта - к машинам', () => {
    expect(parentOf(ROUTES[6] as Route)).toEqual({
      name: 'project',
      agentId: AGENT,
      projectKey: PROJECT,
    })
    expect(parentOf(ROUTES[2] as Route)).toEqual({ name: 'machines' })
    // Доска всех очередей - экран машины; история - экран проекта.
    expect(parentOf({ name: 'board', agentId: AGENT })).toEqual({ name: 'machines' })
    expect(parentOf({ name: 'history', agentId: AGENT, projectKey: PROJECT })).toEqual({
      name: 'project',
      agentId: AGENT,
      projectKey: PROJECT,
    })
    // Экраны машины - к машинам; сценарий - к полкам, расписание - к сценарию, журнал - к прогону.
    expect(parentOf({ name: 'accounts', agentId: AGENT })).toEqual({ name: 'machines' })
    expect(
      parentOf({
        name: 'scenario',
        agentId: AGENT,
        projectKey: PROJECT,
        scope: 'user',
        scenarioId: 'a',
      }),
    ).toEqual({ name: 'scenarios', agentId: AGENT, projectKey: PROJECT })
    expect(
      parentOf({
        name: 'schedule',
        agentId: AGENT,
        projectKey: PROJECT,
        scope: 'user',
        scenarioId: 'a',
      }),
    ).toEqual({
      name: 'scenario',
      agentId: AGENT,
      projectKey: PROJECT,
      scope: 'user',
      scenarioId: 'a',
    })
    expect(
      parentOf({
        name: 'stepLog',
        agentId: AGENT,
        projectKey: PROJECT,
        runId: 'r',
        stepKey: 'head',
      }),
    ).toEqual({ name: 'run', agentId: AGENT, projectKey: PROJECT, runId: 'r' })
  })
})
