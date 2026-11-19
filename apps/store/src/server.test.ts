import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type {
  ReviewPage,
  ListingPage,
  ListingDetail,
} from '@agentic-workstation/store-protocol/api'
import { newStoreKeys, signedHeaders } from '@agentic-workstation/store-protocol/node-signer'
import type { StoreKeys } from '@agentic-workstation/store-protocol/node-signer'
import { PACKAGE_FORMAT } from '@agentic-workstation/store-protocol/package-format'

import type { Config } from './config.ts'
import type { Store } from './server.ts'
import { createStore } from './server.ts'

const CONFIG: Config = {
  port: 0,
  build: 'test',
  dataDir: ':memory:',
  adminToken: 'admin-secret',
  trustProxy: false,
  maxBodyBytes: 3 * 1024 * 1024,
  readsPerMinute: 1000,
  writesPerMinute: 1000,
  publishesPerHour: 100,
}

const pkg = (version: string, patch: Record<string, unknown> = {}) => ({
  format: PACKAGE_FORMAT,
  manifest: {
    id: 'todo',
    name: 'Todo',
    version,
    apiVersion: 1,
    description: 'A todo list',
    ...patch,
  },
  files: { 'main.js': 'export function activate() {}', 'README.md': '# Todo\n\nKeeps a list.' },
})

describe('магазин расширений', () => {
  let store: Store
  let base = ''
  const author = newStoreKeys()
  const user = newStoreKeys()

  const call = async (
    method: string,
    path: string,
    body?: unknown,
    keys?: StoreKeys,
    extra: Record<string, string> = {},
  ) => {
    const text = body === undefined ? '' : JSON.stringify(body)
    const headers = {
      'content-type': 'application/json',
      ...extra,
      ...(keys ? signedHeaders(keys, { method, path, body: text }) : {}),
    }
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: text }),
    })

    return { status: response.status, json: (await response.json()) as Record<string, unknown> }
  }

  beforeEach(async () => {
    store = createStore(CONFIG, () => undefined)
    base = `http://127.0.0.1:${await store.listen(0)}`
  })

  afterEach(async () => {
    await store.close()
  })

  it('публикует, показывает в каталоге и отдаёт пакет с отпечатком', async () => {
    const published = await call(
      'POST',
      '/v1/extensions/todo/versions',
      pkg('1.0.0', { permissions: ['network'], network: { hosts: ['api.example.com'] } }),
      author,
    )

    expect(published.status).toBe(201)
    expect(published.json).toMatchObject({ id: 'todo', version: '1.0.0' })

    const page = (await call('GET', '/v1/extensions?q=todo')).json as unknown as ListingPage

    expect(page.total).toBe(1)
    expect(page.items[0]).toMatchObject({
      id: 'todo',
      name: 'Todo',
      permissions: ['network'],
      installs: 0,
    })

    const detail = (await call('GET', '/v1/extensions/todo')).json as unknown as ListingDetail
    const picked = (await call('GET', '/v1/extensions?ids=todo,missing'))
      .json as unknown as ListingPage

    expect(picked.items.map((item) => item.id)).toEqual(['todo'])
    expect(detail.readme).toContain('Keeps a list')
    expect(detail.versions[0]).toMatchObject({ version: '1.0.0', hosts: ['api.example.com'] })

    const response = await fetch(`${base}/v1/extensions/todo/versions/1.0.0`)

    expect(response.headers.get('x-aw-digest')).toBe(published.json['digest'])
    expect(
      ((await response.json()) as { files: Record<string, string> }).files['main.js'],
    ).toContain('activate')
  })

  it('без подписи и с чужой подписью записи нет; повтор подписанного запроса отклонён', async () => {
    expect((await call('POST', '/v1/extensions/todo/versions', pkg('1.0.0'))).status).toBe(401)

    const text = JSON.stringify(pkg('1.0.0'))
    const headers = {
      'content-type': 'application/json',
      ...signedHeaders(author, {
        method: 'POST',
        path: '/v1/extensions/todo/versions',
        body: text,
      }),
    }
    const tampered = JSON.stringify(pkg('9.9.9'))

    expect(
      (
        await fetch(`${base}/v1/extensions/todo/versions`, {
          method: 'POST',
          headers,
          body: tampered,
        })
      ).status,
    ).toBe(401)
    expect(
      (await fetch(`${base}/v1/extensions/todo/versions`, { method: 'POST', headers, body: text }))
        .status,
    ).toBe(201)
    expect(
      (await fetch(`${base}/v1/extensions/todo/versions`, { method: 'POST', headers, body: text }))
        .status,
    ).toBe(401)
  })

  it('версия только выше, расширение - только своего ключа', async () => {
    await call('POST', '/v1/extensions/todo/versions', pkg('1.0.0'), author)

    expect(
      (await call('POST', '/v1/extensions/todo/versions', pkg('1.0.0'), author)).json['error'],
    ).toBe('version-exists')
    expect(
      (await call('POST', '/v1/extensions/todo/versions', pkg('2.0.0'), user)).json['error'],
    ).toBe('not-owner')
    expect((await call('POST', '/v1/extensions/todo/versions', pkg('1.1.0'), author)).status).toBe(
      201,
    )
    expect(
      (await call('POST', '/v1/extensions/other/versions', pkg('1.0.0'), author)).json['error'],
    ).toBe('bad-request')
  })

  it('отзыв - после установки, один на ключ, не своему; оценка считается', async () => {
    await call('POST', '/v1/extensions/todo/versions', pkg('1.0.0'), author)

    expect(
      (await call('PUT', '/v1/extensions/todo/reviews', { rating: 5, text: 'Great' }, user)).json[
        'error'
      ],
    ).toBe('not-installed')

    await call('POST', '/v1/extensions/todo/installs', { version: '1.0.0' }, user)
    await call('POST', '/v1/extensions/todo/installs', { version: '1.0.0' }, user)

    expect(
      (await call('PUT', '/v1/extensions/todo/reviews', { rating: 4, text: 'Good' }, user)).status,
    ).toBe(200)
    expect(
      (
        await call(
          'PUT',
          '/v1/extensions/todo/reviews',
          { rating: 2, text: 'Changed my mind' },
          user,
        )
      ).status,
    ).toBe(200)
    expect(
      (await call('POST', '/v1/extensions/todo/installs', { version: '1.0.0' }, author)).status,
    ).toBe(200)
    expect(
      (await call('PUT', '/v1/extensions/todo/reviews', { rating: 5, text: 'Mine' }, author)).json[
        'error'
      ],
    ).toBe('own-extension')

    const detail = (await call('GET', '/v1/extensions/todo')).json as unknown as ListingDetail
    const reviews = (await call('GET', '/v1/extensions/todo/reviews')).json as unknown as ReviewPage

    expect(detail).toMatchObject({
      installs: 2,
      rating: { average: 2, count: 1 },
      ratings: [0, 1, 0, 0, 0],
    })
    expect(reviews.items).toMatchObject([{ rating: 2, text: 'Changed my mind', version: '1.0.0' }])
  })

  it('имя издателя, снятие владельцем и модерацией', async () => {
    await call('POST', '/v1/extensions/todo/versions', pkg('1.0.0'), author)

    expect((await call('PUT', '/v1/me', { name: 'Max' }, author)).json).toMatchObject({
      name: 'Max',
    })
    expect(
      ((await call('GET', '/v1/extensions')).json as unknown as ListingPage).items[0]?.publisher
        .name,
    ).toBe('Max')
    expect((await call('DELETE', '/v1/extensions/todo', undefined, user)).json['error']).toBe(
      'not-owner',
    )
    expect(
      (
        await call('DELETE', '/v1/extensions/todo', undefined, undefined, {
          authorization: 'Bearer admin-secret',
        })
      ).status,
    ).toBe(200)
    expect((await call('GET', '/v1/extensions/todo')).status).toBe(404)
  })

  it('пакет с путём наружу не публикуется', async () => {
    const bad = { ...pkg('1.0.0'), files: { 'main.js': '', '../../etc/passwd.txt': 'x' } }

    expect((await call('POST', '/v1/extensions/todo/versions', bad, author)).json['error']).toBe(
      'bad-request',
    )
  })
})
