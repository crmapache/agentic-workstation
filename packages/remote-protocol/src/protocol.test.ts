import { it, expect, describe } from 'vitest'

import { parseAgentMessage, parseHandshakeReply } from './agent-messages'
import { decodeBody, encodeBody, utf8Length } from './body'
import { parseCommand, COMMAND_NAMES, COMMAND_LIMITS, REFUSED_COMMANDS } from './commands'
import { applyFeedPatch, prependFeedPage, feedFromSnapshot } from './feed'
import { MAX_BODY_BYTES } from './frame'
import { MAX_IMAGES_CHARS } from './message-size'
import { pairingUrl, parsePairingFragment } from './pairing-url'
import { MAX_PARTS, splitIntoParts } from './parts'
import { parseHandshake, parsePhoneMessage } from './phone-messages'
import { splitPlaceholders } from './placeholders'
import { isFeedStub } from './wire-types'

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

  it('история, страница выше и картинка - чтение по просьбе с проверкой аргументов', () => {
    const project = `p-${AGENT}`

    expect(
      parseCommand('conversation.history', { projectKey: project, provider: 'claude' }).ok,
    ).toBe(true)
    expect(
      parseCommand('conversation.history', { projectKey: '/Users/x', provider: 'claude' }).ok,
    ).toBe(false)
    expect(
      parseCommand('conversation.openHistory', {
        projectKey: project,
        provider: 'claude',
        sessionId: CONVERSATION,
      }).ok,
    ).toBe(true)
    expect(
      parseCommand('conversation.openHistory', {
        projectKey: project,
        provider: 'claude',
        sessionId: '../../etc/passwd',
      }).ok,
    ).toBe(false)
    expect(
      parseCommand('conversation.earlier', { conversationId: CONVERSATION, before: 'a1' }).ok,
    ).toBe(true)
    expect(
      parseCommand('conversation.earlier', { conversationId: CONVERSATION, before: '' }).ok,
    ).toBe(false)
    expect(
      parseCommand('conversation.image', {
        conversationId: CONVERSATION,
        messageId: 'u1',
        index: 0,
      }).ok,
    ).toBe(true)
    expect(
      parseCommand('conversation.image', {
        conversationId: CONVERSATION,
        messageId: 'u1',
        index: -1,
      }).ok,
    ).toBe(false)
  })

  it('у каждой команды свой предел частоты', () => {
    for (const name of COMMAND_NAMES) expect(COMMAND_LIMITS[name]).toBeGreaterThan(0)
  })

  it('ответ прогону - с опознанием вопроса, кнопка прогона - с состоянием, для которого нарисована', () => {
    const question = { stepKey: 's1', askedAt: 5 }

    expect(parseCommand('scenarios.answer', { runId: 'r', allow: true, text: '' }).ok).toBe(false)
    expect(
      parseCommand('scenarios.answer', { runId: 'r', question, allow: true, text: '' }).ok,
    ).toBe(true)
    expect(parseCommand('scenarios.control', { runId: 'r', action: 'pause' }).ok).toBe(false)
    expect(
      parseCommand('scenarios.control', { runId: 'r', action: 'pause', seen: 'running' }).ok,
    ).toBe(true)
    expect(parseCommand('scenarios.control', { runId: 'r', action: 'stop', seen: 'done' }).ok).toBe(
      false,
    )
  })

  it('ключ проекта один на открытый и закрытый, приставки недавнего больше нет', () => {
    const shelves = (projectKey: string) => parseCommand('scenarios.shelves', { projectKey }).ok

    expect(shelves(`p-${AGENT}`)).toBe(true)
    expect(shelves(`r-${AGENT}`)).toBe(false)
    expect(parsePhoneMessage({ p: 1, k: 'subscribe', projectKey: `r-${AGENT}` })).toBeNull()
  })

  it('фото - одним потолком веса на всё сообщение', () => {
    const image = (chars: number) => ({ mediaType: 'image/png', data: 'A'.repeat(chars) })
    const send = (images: object[]) =>
      parseCommand('conversation.send', { conversationId: CONVERSATION, text: '', images }).ok

    expect(send([image(MAX_IMAGES_CHARS)])).toBe(true)
    expect(send([image(MAX_IMAGES_CHARS / 2), image(MAX_IMAGES_CHARS / 2 + 4)])).toBe(false)
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

  it('стук с номером и «забудь меня» - слова телефона', () => {
    expect(parsePhoneMessage({ p: 1, k: 'ping', n: 3 })).toEqual({ p: 1, k: 'ping', n: 3 })
    expect(parsePhoneMessage({ p: 1, k: 'unpair' })).toEqual({ p: 1, k: 'unpair' })
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
    expect(parseAgentMessage({ p: 1, k: 'pong', n: 1 })).not.toBeNull()
    expect(parseAgentMessage({ p: 1, k: 'pairAck' })).toBeNull()
    expect(parseHandshakeReply({ p: 1, k: 'pairAck' })).not.toBeNull()
    expect(parseHandshakeReply({ p: 1, k: 'pairRefused' })).not.toBeNull()
  })
})

describe('тело и части', () => {
  it('JSON в UTF-8 туда и обратно; не объект - null', () => {
    expect(decodeBody(encodeBody({ k: 'привет' }))).toEqual({ k: 'привет' })
    expect(decodeBody(Uint8Array.of(0xff))).toBeNull()
    expect(decodeBody(new TextEncoder().encode('[1]'))).toBeNull()
    expect(utf8Length('aя😀')).toBe(new TextEncoder().encode('aя😀').length)
  })

  it('режет по байтам на проводе: каждый кусок с конвертом влезает в кадр, склеивается обратно', () => {
    // Кавычки удваиваются в JSON, кириллица - два байта, эмодзи - четыре: по знакам не влезло бы.
    const text = JSON.stringify({
      text: '"\\\n'.repeat(40_000) + 'я'.repeat(90_000) + '😀'.repeat(30_000),
    })
    const parts = splitIntoParts('m1', text)

    expect(parts.length).toBeGreaterThan(2)
    expect(parts.map((part) => part.d).join('')).toBe(text)
    expect(parts.every((part) => parsePhoneMessage(part) !== null)).toBe(true)

    for (const part of parts) expect(encodeBody(part).length).toBeLessThanOrEqual(MAX_BODY_BYTES)

    expect(() => splitIntoParts('m2', 'x'.repeat(MAX_BODY_BYTES * (MAX_PARTS + 1)))).toThrow()
  })

  it('сообщение тяжелее кадра - всегда не меньше двух кусков; пара суррогатов не рвётся', () => {
    const justOver = 'я'.repeat(Math.ceil(MAX_BODY_BYTES / 2) + 1)

    expect(utf8Length(justOver)).toBeGreaterThan(MAX_BODY_BYTES)
    expect(splitIntoParts('m3', justOver).length).toBeGreaterThanOrEqual(2)

    // Даже то, что влезло бы одним куском, режется надвое: слово part - это n ≥ 2.
    const small = splitIntoParts('m4', '😀😀😀')

    expect(small.map((part) => part.n)).toEqual([2, 2])
    expect(small.map((part) => part.d).join('')).toBe('😀😀😀')

    const emoji = splitIntoParts('m5', '😀'.repeat(200), 400)

    for (const part of emoji) expect(part.d).toMatch(/^(?:\uD83D\uDE00)+$/)
  })
})

describe('метки папок и карточки', () => {
  it('метки - отдельными кусками; «~» - только как начало пути', () => {
    expect(splitPlaceholders('edit {project}/src/a.ts and ~/notes')).toEqual([
      { text: 'edit ', placeholder: false },
      { text: '{project}', placeholder: true },
      { text: '/src/a.ts and ', placeholder: false },
      { text: '~', placeholder: true },
      { text: '/notes', placeholder: false },
    ])
    expect(splitPlaceholders('about ~5 minutes, a~/b')).toEqual([
      { text: 'about ~5 minutes, a~/b', placeholder: false },
    ])
    expect(splitPlaceholders('cd ~')).toEqual([
      { text: 'cd ', placeholder: false },
      { text: '~', placeholder: true },
    ])
    expect(splitPlaceholders('')).toEqual([{ text: '', placeholder: false }])
  })

  it('карточка вместо элемента узнаётся по stub: true', () => {
    expect(isFeedStub({ id: 'a', kind: 'tool', stub: true })).toBe(true)
    expect(isFeedStub({ id: 'a', kind: 'tool', stub: 'yes' })).toBe(false)
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

  it('страница выше встаёт перед лентой, только если лента начинается тем, перед чем просили', () => {
    const page = { items: [item('y', '1'), item('z', '1'), item('a', 'old')], hasEarlier: false }
    const prepended = prependFeedPage(view, 'a', page)

    // «a» уже есть - второй раз не встаёт; номер журнала тот же: страница - не заплатка.
    expect(prepended?.items.map((one) => one.id)).toEqual(['y', 'z', 'a', 'b'])
    expect(prepended?.items[2]).toEqual(item('a', '1'))
    expect(prepended).toMatchObject({ seq: 4, hasEarlier: false })
    // Пока страница шла, пришёл снимок с другим началом - страница не к этой ленте.
    expect(prependFeedPage(view, 'b', page)).toBeNull()

    // Заплатка после страницы меняет её элементы на месте, новое - в конец.
    const patched =
      prepended && applyFeedPatch(prepended, patch(5, [item('y', '2'), item('n', '1')]))

    expect(patched?.items.map((one) => `${one.id}${String(one['text'])}`)).toEqual([
      'y2',
      'z1',
      'a1',
      'b1',
      'n1',
    ])
  })

  it('повтор - без перемен, пропуск номера и другая жизнь IDE - подписаться заново', () => {
    expect(applyFeedPatch(view, patch(4, [item('z', '1')]))).toBe(view)
    expect(applyFeedPatch(view, patch(7, []))).toBeNull()
    expect(applyFeedPatch(view, { ...patch(5, []), epoch: 'other' })).toBeNull()
  })
})
