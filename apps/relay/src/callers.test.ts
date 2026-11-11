import type { IncomingMessage } from 'node:http'

import { it, expect, describe } from 'vitest'

import { clientIp, ANONYMOUS, expandIpv6, isPrivateAddress } from './callers.ts'
import { readConfig } from './config.ts'

const request = (forwarded?: string) =>
  ({
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
  }) as unknown as IncomingMessage

describe('кто звонит', () => {
  it('X-Forwarded-For по умолчанию не читается вовсе', () => {
    expect(readConfig({}).trustProxy).toBe(false)
    expect(readConfig({ RELAY_TRUST_PROXY: '1' }).trustProxy).toBe(true)
    expect(clientIp(request('203.0.113.9'), '10.0.1.7', false)).toBe(ANONYMOUS)
  })

  it('прокси из своей сети называет звонящего, чужой из интернета - нет', () => {
    // Traefik Coolify приходит из докер-сети: его запись - правда.
    expect(clientIp(request('198.51.100.1, 203.0.113.9'), '10.0.1.7', true)).toBe('203.0.113.9')
    expect(clientIp(request('203.0.113.9'), '::ffff:172.18.0.3', true)).toBe('203.0.113.9')
    expect(clientIp(request('203.0.113.9'), '127.0.0.1', true)).toBe('203.0.113.9')
    // Звонящий из интернета дописал заголовок сам - считается его собственный адрес.
    expect(clientIp(request('203.0.113.9'), '198.51.100.20', true)).toBe('198.51.100.20')
    // Мусор в заголовке - не адрес и не корзина.
    expect(clientIp(request('not an ip'), '10.0.1.7', true)).toBe(ANONYMOUS)
  })

  it('без прокси адрес из своей сети - «не знаю», CGNAT - снаружи', () => {
    expect(clientIp(request(), '192.168.1.5', false)).toBe(ANONYMOUS)
    expect(clientIp(request(), 'fd00::1', false)).toBe(ANONYMOUS)
    expect(isPrivateAddress('100.64.0.1')).toBe(false)
    expect(isPrivateAddress('fe80::1%en0')).toBe(true)
    expect(isPrivateAddress('172.32.0.1')).toBe(false)
  })

  it('IPv6 считается сетью /64 по полной записи, а не по сжатой', () => {
    expect(expandIpv6('2001:db8::1')).toEqual([
      '2001',
      '0db8',
      '0000',
      '0000',
      '0000',
      '0000',
      '0000',
      '0001',
    ])
    expect(expandIpv6('::')).toHaveLength(8)
    expect(expandIpv6('64:ff9b::192.0.2.33')?.slice(-2)).toEqual(['c000', '0221'])
    expect(expandIpv6('1.2.3.4')).toBeNull()

    // Одна сеть /64 в разной записи - одна корзина; соседняя сеть - другая.
    const bucket = clientIp(request(), '2001:db8:0:0:1::5', false)

    expect(bucket).toBe('2001:0db8:0000:0000')
    expect(clientIp(request(), '2001:db8::9', false)).toBe(bucket)
    expect(clientIp(request(), '2001:db8:0:1::9', false)).not.toBe(bucket)
  })
})
