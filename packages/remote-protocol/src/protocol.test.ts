import { it, expect, describe } from 'vitest'

import { parseAgentMessage, parseHandshakeReply } from './agent-messages'
import { decodeBody, encodeBody, utf8Length } from './body'
import { parseCommand, COMMAND_NAMES, COMMAND_LIMITS, REFUSED_COMMANDS } from './commands'
import { applyFeedPatch, feedFromSnapshot } from './feed'
import { pairingUrl, parsePairingFragment } from './pairing-url'
import { MAX_PARTS, PART_CHARS, splitIntoParts } from './parts'
import { parseHandshake, parsePhoneMessage } from './phone-messages'

const AGENT = 'A'.repeat(22)

const CONVERSATION = '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f'

describe('адрес пары', () => {
  it('секрет и отпечаток - после #, страница на хосте релея', () => {
    const secret = Uint8Array.from({ length: 16 }, (_, index) => index)
    const url = pairingUrl('wss://relay.example/', {
      agentId: AGENT,
      secret,
      fingerprint: 'ABCD EF01 2345 6789',
    })

    expect(url).toBe(
      `https://relay.example/pair#aw1.${AGENT}.AAECAwQFBgcICQoLDA0ODw.ABCDEF0123456789`,
    )

    const code = parsePairingFragment(new URL(url).hash)

    expect(code?.agentId).toBe(AGENT)
    expect([...(code?.secret ?? [])]).toEqual([...secret])
    expect(code?.fingerprint).toBe('ABCDEF0123456789')
  })

  it('код ACC и испорченный код не принимаются', () => {
    expect(parsePairingFragment(`#1.${AGENT}.AAECAwQFBgcICQoLDA0ODw.ABCDEF0123456789`)).toBeNull()
    expect(parsePairingFragment(`#aw1.${AGENT}.short.ABCDEF0123456789`)).toBeNull()
    expect(parsePairingFragment(`#aw1.bad.AAECAwQFBgcICQoLDA0ODw.ABCDEF0123456789`)).toBeNull()
  })
})

describe('белый список команд', () => {
  it('пускает названное с верными аргументами', () => {
    const sent = parseCommand('conversation.send', { conversationId: CONVERSATION, text: 'hi' })

    expect(sent).toMatchObject({
      ok: true,
      command: { name: 'conversation.send', args: { text: 'hi' } },
    })
  })

  it('незнакомое и запрещённое - unknownCommand, кривые аргументы - badArgs', () => {
    expect(parseCommand('terminal.run', {})).toEqual({ ok: false, code: 'unknownCommand' })
    expect(parseCommand('toString', {})).toEqual({ ok: false, code: 'unknownCommand' })
    expect(parseCommand('conversation.send', { conversationId: '../x', text: 'hi' })).toEqual({
      ok: false,
      code: 'badArgs',
    })

    for (const name of REFUSED_COMMANDS) expect(parseCommand(name, {}).ok).toBe(false)
  })

  it('«разрешать всегда», bypass и закрытие очереди не выражаются вовсе', () => {
    const respond = (decision: object) =>
      parseCommand('conversation.respond', {
        conversationId: CONVERSATION,
        requestId: 'r1',
        decision,
      })

    expect(respond({ kind: 'permission', allow: true }).ok).toBe(true)
    expect(respond({ kind: 'permission', behavior: 'allowAlways' }).ok).toBe(false)
    expect(
      parseCommand('conversation.new', {
        projectKey: `p-${AGENT}`,
        provider: 'claude',
        permissionMode: 'bypassPermissions',
      }).ok,
    ).toBe(false)
    expect(parseCommand('scenarios.queue', { queueId: 'q1', action: { kind: 'close' } }).ok).toBe(
      false,
    )
    expect(
      parseCommand('scenarios.queue', {
        queueId: 'q1',
        action: { kind: 'stopAfter', itemId: null },
      }).ok,
    ).toBe(true)
  })

  it('у каждой команды свой предел частоты', () => {
    for (const name of COMMAND_NAMES) expect(COMMAND_LIMITS[name]).toBeGreaterThan(0)
  })
})

describe('слова телефона', () => {
  it('подписка - ровно на что-то одно', () => {
    expect(
      parsePhoneMessage({
        p: 1,
        k: 'subscribe',
        conversationId: CONVERSATION,
        since: 4,
        epoch: 'e',
      }),
    ).not.toBeNull()
    expect(parsePhoneMessage({ p: 1, k: 'subscribe', projectKey: '*' })).not.toBeNull()
    expect(parsePhoneMessage({ p: 1, k: 'subscribe' })).toBeNull()
    expect(parsePhoneMessage({ p: 1, k: 'subscribe', runId: 'r', projectKey: '*' })).toBeNull()
  })

  it('чужая версия и незнакомый вид - не сообщение', () => {
    expect(parsePhoneMessage({ p: 2, k: 'hello' })).toBeNull()
    expect(parsePhoneMessage({ p: 1, k: 'bash' })).toBeNull()
    expect(parsePhoneMessage({ p: 1, k: 'hello' })).toEqual({ p: 1, k: 'hello' })
  })

  it('рукопожатие - только пара и переподключение', () => {
    expect(
      parseHandshake({ p: 1, k: 'sessionInit', deviceId: AGENT, ephemeralPub: 'x'.repeat(60) }),
    ).not.toBeNull()
    expect(parseHandshake({ p: 1, k: 'cmd' })).toBeNull()
  })

  it('слова IDE узнаются по виду', () => {
    expect(parseAgentMessage({ p: 1, k: 'inventory' })).not.toBeNull()
    expect(parseAgentMessage({ p: 1, k: 'pairAck' })).toBeNull()
    expect(parseHandshakeReply({ p: 1, k: 'pairAck' })).not.toBeNull()
  })
})

describe('тело и части', () => {
  it('JSON в UTF-8 туда и обратно; не объект - null', () => {
    expect(decodeBody(encodeBody({ k: 'привет' }))).toEqual({ k: 'привет' })
    expect(decodeBody(Uint8Array.of(0xff))).toBeNull()
    expect(decodeBody(new TextEncoder().encode('[1]'))).toBeNull()
    expect(utf8Length('aя😀')).toBe(new TextEncoder().encode('aя😀').length)
  })

  it('режет на куски, которые склеиваются обратно', () => {
    const text = 'x'.repeat(PART_CHARS * 2 + 5)
    const parts = splitIntoParts('m1', text)

    expect(parts).toHaveLength(3)
    expect(parts.map((part) => part.d).join('')).toBe(text)
    expect(parts.every((part) => parsePhoneMessage(part) !== null)).toBe(true)
    expect(() => splitIntoParts('m2', 'x'.repeat(PART_CHARS * (MAX_PARTS + 1)))).toThrow()
  })
})

describe('лента на телефоне', () => {
  const item = (id: string, text: string) => ({ id, kind: 'assistant', text })
  const view = feedFromSnapshot({
    p: 1,
    k: 'feed',
    conversationId: 'c',
    epoch: 'e',
    seq: 4,
    items: [item('a', '1'), item('b', '1')],
    tasks: [],
    hasEarlier: true,
  })
  const patch = (seq: number, upserts: ReturnType<typeof item>[], removes?: string[]) => ({
    p: 1 as const,
    k: 'patch' as const,
    conversationId: 'c',
    epoch: 'e',
    seq,
    upserts,
    removes,
  })

  it('снятое уходит, известное меняется на месте, новое - в конец', () => {
    const next = applyFeedPatch(view, patch(5, [item('c', '1'), item('b', '2')], ['a']))

    expect(next?.items).toEqual([item('b', '2'), item('c', '1')])
    expect(next?.seq).toBe(5)
  })

  it('повтор - без перемен, пропуск номера и другая жизнь IDE - подписаться заново', () => {
    expect(applyFeedPatch(view, patch(4, [item('z', '1')]))).toBe(view)
    expect(applyFeedPatch(view, patch(7, []))).toBeNull()
    expect(applyFeedPatch(view, { ...patch(5, []), epoch: 'other' })).toBeNull()
  })
})
