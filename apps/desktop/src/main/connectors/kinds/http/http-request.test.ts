import { it, expect, describe } from 'vitest'

import type { SpecTool } from '@shared/connector-spec'

import { ArgumentError } from '../native-tools'
import { buildRequest } from './http-request'
import { parseSpec, parseAiSpec } from './http-spec'

const tool: SpecTool = {
  name: 'get_task',
  description: 'Get a task',
  access: 'read',
  method: 'GET',
  path: '/tasks/{task_id}',
  query: ['fields'],
  body: [],
  inputSchema: {
    type: 'object',
    properties: { task_id: { type: 'string' }, fields: { type: 'array' } },
    required: ['task_id'],
  },
}

const key = { secret: 'k', username: '' }

describe('buildRequest', () => {
  it('аргумент пути экранирован, параметры адреса и ключ Bearer на месте', () => {
    const { url, init } = buildRequest(
      'https://api.x.com/v1',
      { type: 'bearer' },
      tool,
      { task_id: 'a/b', fields: ['x', 'y'] },
      key,
    )

    expect(url).toBe('https://api.x.com/v1/tasks/a%2Fb?fields=x&fields=y')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer k' })
    expect(init.redirect).toBe('error')
  })

  it('«..» в пути и пропущенный аргумент - отказ', () => {
    expect(() =>
      buildRequest('https://api.x.com/v1', { type: 'none' }, tool, { task_id: '..' }, key),
    ).toThrow(ArgumentError)
    expect(() => buildRequest('https://api.x.com/v1', { type: 'none' }, tool, {}, key)).toThrow(
      ArgumentError,
    )
  })

  it('тело - только перечисленные поля, ключ в параметре или Basic', () => {
    const create: SpecTool = {
      ...tool,
      method: 'POST',
      path: '/tasks',
      query: [],
      body: ['content'],
      inputSchema: { type: 'object', properties: { content: { type: 'string' } } },
    }
    const query = buildRequest(
      'https://api.x.com',
      { type: 'query', name: 'api_key' },
      create,
      { content: 'Hi', extra: 'no' },
      key,
    )
    const basic = buildRequest(
      'https://api.x.com',
      { type: 'basic' },
      create,
      {},
      {
        secret: 'p',
        username: 'u',
      },
    )

    expect(query.url).toBe('https://api.x.com/tasks?api_key=k')
    expect(query.init.body).toBe('{"content":"Hi"}')
    expect(basic.init.headers).toMatchObject({ Authorization: `Basic ${btoa('u:p')}` })
  })

  it('выход за базовый путь сравнивается по сегменту: /v1 не пускает на /v10', () => {
    const escaping = { ...tool, path: '/../v10/tasks', query: [] }

    expect(() =>
      buildRequest('https://api.x.com/v1', { type: 'bearer' }, escaping, {}, key),
    ).toThrow(ArgumentError)
  })
})

describe('parseSpec', () => {
  const spec = {
    service: 'X',
    baseUrl: 'https://api.x.com/v1',
    auth: { type: 'bearer' },
    authHelp: 'Settings → API',
    tools: [tool],
  }

  it('годное описание проходит', () => {
    expect(parseSpec(spec)).toEqual(spec)
  })

  it('http, неописанный аргумент, повтор имени - отказ', () => {
    expect(parseSpec({ ...spec, baseUrl: 'http://api.x.com' })).toBeNull()
    expect(parseSpec({ ...spec, tools: [{ ...tool, query: ['missing'] }] })).toBeNull()
    expect(parseSpec({ ...spec, tools: [tool, tool] })).toBeNull()
    expect(parseSpec({ ...spec, tools: [{ ...tool, name: 'Bad Name' }] })).toBeNull()
  })

  it('путь с «..», %2e, обратной косой или строкой запроса - отказ', () => {
    for (const path of ['/a/../b', '/a/%2E%2e/b', '/a/.', '/a\\b', '/a?x=1', 'a/b']) {
      expect(parseSpec({ ...spec, tools: [{ ...tool, path }] }), path).toBeNull()
    }
  })
})

describe('parseAiSpec', () => {
  const spec = {
    service: 'X',
    baseUrl: 'https://api.x.com/v1',
    auth: { type: 'bearer' },
    authHelp: '',
    tools: [tool],
  }
  const broken = { ...tool, name: 'get_project', path: '/projects/{project_id}' }

  it('кривой инструмент выбрасывается и называется, остальное остаётся', () => {
    expect(parseAiSpec({ ...spec, tools: [tool, broken, tool] })).toEqual({
      spec,
      dropped: ['get_project', 'get_task'],
    })
  })

  it('не осталось ничего - отказ с тем, что не прошло', () => {
    const outcome = parseAiSpec({ ...spec, tools: [broken] })

    expect(outcome.spec).toBeNull()
    expect('detail' in outcome && outcome.detail).toContain('get_project')
  })
})
