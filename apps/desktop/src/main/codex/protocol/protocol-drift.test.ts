import { spawnSync } from 'node:child_process'
import { rmSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import {
  CLIENT_METHODS,
  SERVER_REQUESTS,
  THREAD_ITEM_TYPES,
  SERVER_NOTIFICATIONS,
} from './protocol-methods'

type Variant = { properties?: { method?: { enum?: string[] }; type?: { enum?: string[] } } }
type Schema = { oneOf?: Variant[]; definitions?: Record<string, { oneOf?: Variant[] }> }

/** Схема протокола установленного Codex; Codex нет - null, проверка пропускается. */
const generateSchema = (): string | null => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-schema-'))
  const run = spawnSync('codex', ['app-server', 'generate-json-schema', '--out', dir], {
    encoding: 'utf8',
    timeout: 60_000,
  })

  if (run.status !== 0) {
    rmSync(dir, { recursive: true, force: true })

    return null
  }

  return dir
}

const dir = generateSchema()

const read = (name: string): Schema =>
  JSON.parse(readFileSync(join(dir ?? '', `${name}.json`), 'utf8')) as Schema

const methodsOf = (schema: Schema): string[] =>
  (schema.oneOf ?? []).flatMap((variant) => variant.properties?.method?.enum ?? [])

describe.skipIf(dir === null)('протокол Codex не разошёлся с установленным CLI', () => {
  it('запросы клиента, уведомления и вопросы сервера - те, на которые опирается IDE', () => {
    expect(methodsOf(read('ClientRequest'))).toEqual(expect.arrayContaining([...CLIENT_METHODS]))
    expect(methodsOf(read('ServerNotification'))).toEqual(
      expect.arrayContaining([...SERVER_NOTIFICATIONS]),
    )
    expect(methodsOf(read('ServerRequest'))).toEqual(expect.arrayContaining([...SERVER_REQUESTS]))
  })

  it('виды элементов разговора, которые IDE переводит в ленту', () => {
    const items = read('codex_app_server_protocol.v2.schemas').definitions?.['ThreadItem']
    const types = (items?.oneOf ?? []).flatMap((variant) => variant.properties?.type?.enum ?? [])

    expect(types).toEqual(expect.arrayContaining([...THREAD_ITEM_TYPES]))
    rmSync(dir ?? '', { recursive: true, force: true })
  })
})
