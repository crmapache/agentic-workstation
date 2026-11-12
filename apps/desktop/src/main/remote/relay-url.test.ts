import { it, expect } from 'vitest'

import { relayUrlFor } from './relay-url'
import { RELAY_URL, RELAY_URL_ENV } from './remote.constants'

it('адрес релея из переменной - только у несобранной IDE', () => {
  const env = { [RELAY_URL_ENV]: 'wss://somebody-else.example' }

  expect(relayUrlFor(env, false)).toBe('wss://somebody-else.example')
  expect(relayUrlFor(env, true)).toBe(RELAY_URL)
  expect(relayUrlFor({}, false)).toBe(RELAY_URL)
})
