import { it, expect, describe } from 'vitest'

import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'

import { codeFromLink, takePairingCode } from './pairing-link'

const AGENT = toBase64Url(new Uint8Array(16).fill(7))

const SECRET = toBase64Url(new Uint8Array(16).fill(9))

const FRAGMENT = `#aw1.${AGENT}.${SECRET}.0011223344556677`

const history = () => {
  const calls: string[] = []

  return {
    calls,
    state: { depth: 0 },
    replaceState: (_state: unknown, _unused: string, url: string) => {
      calls.push(url)
    },
  }
}

describe('код пары из адреса', () => {
  it('читается и сразу стирается из адреса и истории', () => {
    const place = history()
    const taken = takePairingCode({ pathname: '/pair', search: '', hash: FRAGMENT }, place)

    expect(taken).toMatchObject({
      kind: 'code',
      code: { agentId: AGENT, fingerprint: '0011223344556677' },
    })
    expect(place.calls).toEqual(['/pair'])
  })

  it('кривой код на /pair - invalid, и фрагмент всё равно стёрт', () => {
    const place = history()

    expect(takePairingCode({ pathname: '/pair', search: '', hash: '#aw1.broken' }, place)).toEqual({
      kind: 'invalid',
    })
    expect(place.calls).toEqual(['/pair'])
  })

  it('код ACC (acc1) - не наш', () => {
    const place = history()
    const acc = FRAGMENT.replace('#aw1.', '#acc1.')

    expect(takePairingCode({ pathname: '/pair', search: '', hash: acc }, place).kind).toBe(
      'invalid',
    )
  })

  it('без фрагмента адрес не трогается', () => {
    const place = history()

    expect(takePairingCode({ pathname: '/', search: '', hash: '' }, place)).toEqual({
      kind: 'none',
    })
    expect(place.calls).toEqual([])
  })

  it('код на другом адресе ведёт на /pair; чужой фрагмент просто стирается', () => {
    const coded = history()

    expect(takePairingCode({ pathname: '/', search: '', hash: FRAGMENT }, coded).kind).toBe('code')
    expect(coded.calls).toEqual(['/pair'])

    const other = history()

    expect(takePairingCode({ pathname: '/m/x', search: '?a=1', hash: '#x' }, other)).toEqual({
      kind: 'none',
    })
    expect(other.calls).toEqual(['/m/x?a=1'])
  })
})

describe('код пары вставленным адресом (приложение с экрана «Домой»)', () => {
  const ORIGIN = 'https://relay.example'

  it('адрес пары этого релея - код', () => {
    expect(codeFromLink(`  ${ORIGIN}/pair${FRAGMENT}\n`, ORIGIN)).toMatchObject({
      kind: 'code',
      code: { agentId: AGENT, fingerprint: '0011223344556677' },
    })
  })

  it('чужой релей, не страница пары, испорченный код и не адрес - не код', () => {
    expect(codeFromLink(`https://other.example/pair${FRAGMENT}`, ORIGIN)).toEqual({
      kind: 'invalid',
    })
    expect(codeFromLink(`${ORIGIN}/elsewhere${FRAGMENT}`, ORIGIN)).toEqual({ kind: 'invalid' })
    expect(codeFromLink(`${ORIGIN}/pair#aw1.${AGENT}.short.0011223344556677`, ORIGIN)).toEqual({
      kind: 'invalid',
    })
    expect(codeFromLink('pair me please', ORIGIN)).toEqual({ kind: 'invalid' })
  })
})
