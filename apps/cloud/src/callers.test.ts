import type { IncomingMessage } from 'node:http'

import { it, expect, describe } from 'vitest'

import { clientIp, ANONYMOUS, expandIpv6, isPrivateAddress } from './callers.ts'
import { configFromEnv } from './config.ts'

const request = (forwarded?: string) =>
  ({
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
  }) as unknown as IncomingMessage

describe('кто звонит', () => {
  it('X-Forwarded-For по умолчанию не читается вовсе', () => {
    expect(configFromEnv({}).trustProxy).toBe(false)
    expect(configFromEnv({ CLOUD_TRUST_PROXY: '1' }).trustProxy).toBe(true)
    expect(clientIp(request('203.0.113.9'), '10.0.1.7', false)).toBe(ANONYMOUS)
  })

  it('верится последняя запись прокси, а не то, что звонящий дописал слева', () => {
    // Traefik дописывает настоящий адрес справа: левые записи прислал сам звонящий.
    expect(clientIp(request('198.51.100.1, 203.0.113.9'), '10.0.1.7', true)).toBe('203.0.113.9')
    expect(clientIp(request('1.1.1.1,203.0.113.9 , '), '10.0.1.7', true)).toBe('203.0.113.9')
    expect(clientIp(request('203.0.113.9'), '::ffff:172.18.0.3', true)).toBe('203.0.113.9')
    expect(clientIp(request('203.0.113.9'), '127.0.0.1', true)).toBe('203.0.113.9')
  })

  it('звонящий из интернета не назовётся чужим адресом; мусор - не корзина', () => {
    expect(clientIp(request('203.0.113.9'), '198.51.100.20', true)).toBe('198.51.100.20')
    expect(clientIp(request('not an ip'), '10.0.1.7', true)).toBe(ANONYMOUS)
    expect(clientIp(request('203.0.113.9, not an ip'), '10.0.1.7', true)).toBe(ANONYMOUS)
  })

  it('без прокси адрес из своей сети - «не знаю», CGNAT - снаружи', () => {
    expect(clientIp(request(), '192.168.1.5', false)).toBe(ANONYMOUS)
    expect(clientIp(request(), 'fd00::1', false)).toBe(ANONYMOUS)
    expect(clientIp(request(), undefined, false)).toBe(ANONYMOUS)
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
    expect(expandIpv6('64:ff9b::192.0.2.33')?.slice(-2)).toEqual(['c000', '0221'])
    expect(expandIpv6('1.2.3.4')).toBeNull()

    const bucket = clientIp(request(), '2001:db8:0:0:1::5', false)

    expect(bucket).toBe('2001:0db8:0000:0000')
    expect(clientIp(request(), '2001:db8::9', false)).toBe(bucket)
    expect(clientIp(request(), '2001:db8:0:1::9', false)).not.toBe(bucket)
    // За прокси - так же: соседи по /64 в одной корзине.
    expect(clientIp(request('2001:db8::77'), '10.0.0.2', true)).toBe(bucket)
  })
})
