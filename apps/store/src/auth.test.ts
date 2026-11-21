import { it, expect } from 'vitest'

import { newStoreKeys, signedHeaders } from '@agentic-workstation/store-protocol/node-signer'

import { SignatureDesk } from './auth.ts'

const keys = newStoreKeys()

const request = () => ({
  method: 'POST',
  path: '/v1/reviews',
  headers: signedHeaders(keys, { method: 'POST', path: '/v1/reviews', body: '{}' }),
  body: Buffer.from('{}'),
})

it('повтор подписи - отказ; полная книга разовых чисел - overloaded, а не рост памяти', () => {
  const desk = new SignatureDesk(Date.now, 1)
  const first = request()

  expect(desk.check(first).ok).toBe(true)
  expect(desk.check(first)).toEqual({ ok: false, error: 'bad-signature' })
  expect(desk.check(request())).toEqual({ ok: false, error: 'overloaded' })
})
