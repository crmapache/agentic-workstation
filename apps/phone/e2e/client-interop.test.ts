import { it, expect, describe, afterEach } from 'vitest'

import { fromBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { FRAME_SEALED } from '@agentic-workstation/remote-protocol/frame'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'

import { loadEarlierPage } from '../src/remote/earlier-pages'
import {
  itemOf,
  PROJECT_PATH,
  CONVERSATION_ID,
} from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import { imageOf, PAST_SESSION } from '../../desktop/src/main/remote/__fixtures__/fake-reads'
import { until } from './ide-harness'
import { phone, lastOf, harness, pairPhone, runCleanups } from './interop-phone'

/**
 * Ядро телефона (apps/phone/src/remote) против настоящей IDE: настоящий релей, настоящий
 * RemoteService главного процесса и его шифрование на node:crypto, телефон - на WebCrypto и
 * WebSocket, как в браузере. Сходится байт в байт - или пара не проходит вовсе.
 */

afterEach(runCleanups)

describe('ядро телефона против настоящей IDE', () => {
  it('пара: отпечатки сходятся, IDE видит телефон, телефон получает список без путей', async () => {
    const ide = await harness()
    const { client, inbox, offer, pending, outcome, code } = await pairPhone(ide)

    expect(outcome.ok).toBe(true)
    // Отпечаток телефона, который человек видит на телефоне, - тот же, что IDE показала у Approve.
    expect(pending.fingerprint.replaceAll(' ', '')).toBe(offer.phoneFingerprint)
    expect(pending.label).toBe('Interop phone')
    expect(client.machines()).toEqual([
      expect.objectContaining({ agentId: code.agentId, label: 'Agentic Workstation on test-mac' }),
    ])

    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')

    expect(JSON.stringify(inventory)).not.toContain('/Users/')
    expect(inventory.projects[0]).toMatchObject({ name: 'secret-client', open: true })
    expect(client.status(code.agentId)).toBe('online')
  })

  it('лента: снимок, сообщение до сервиса, живая заплатка, ответ на разрешение без «всегда»', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId

    await until(() => lastOf(inbox, 'inventory'), 'inventory')
    client.watch(agentId, { kind: 'conversation', conversationId: CONVERSATION_ID })

    const snapshot = await until(() => inbox.feeds.at(-1), 'feed snapshot')

    expect(snapshot.items.map((item) => item.id)).toEqual(['u1', 'a1'])

    const sent = await client.command(agentId, 'conversation.send', {
      conversationId: CONVERSATION_ID,
      text: 'Run the tests',
    })

    expect(sent).toEqual({ ok: true })
    expect(ide.ide.calls).toContainEqual({
      name: 'send',
      args: [CONVERSATION_ID, { text: 'Run the tests', images: [] }],
    })

    ide.say('a2', 'Running them now')

    const patched = await until(
      () => inbox.feeds.find((view) => view.items.some((item) => item.id === 'a2')),
      'live patch',
    )

    expect(patched.items.map((item) => item.id)).toEqual(['u1', 'a1', 'u3', 'a2'])

    ide.ask()

    const asked = await until(
      () =>
        inbox.messages.find(
          (message) => message.k === 'conversation' && message.conversation.pending !== null,
        ),
      'permission request',
    )

    expect(asked).toMatchObject({ conversation: { pending: { kind: 'permission' } } })

    const answered = await client.command(agentId, 'conversation.respond', {
      conversationId: CONVERSATION_ID,
      requestId: 'perm-1',
      decision: { kind: 'permission', allow: true },
    })

    expect(answered).toEqual({ ok: true })
    expect(ide.ide.calls).toContainEqual({
      name: 'respond',
      args: [CONVERSATION_ID, 'perm-1', { kind: 'permission', decision: { behavior: 'allow' } }],
    })
  })

  it('ранние сообщения: страница из IDE встаёт перед лентой, а заплатки идут дальше', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId

    await until(() => lastOf(inbox, 'inventory'), 'inventory')
    ide.ide.feed.hasEarlier = true
    ide.ide.earlier.push(itemOf('e0', `Read ${PROJECT_PATH}/README.md`), itemOf('e1', 'Earlier'))
    client.watch(agentId, { kind: 'conversation', conversationId: CONVERSATION_ID })

    const snapshot = await until(() => inbox.feeds.at(-1), 'feed snapshot')

    expect(snapshot.hasEarlier).toBe(true)
    expect(await loadEarlierPage(client, agentId, CONVERSATION_ID)).toEqual({
      ok: true,
      data: true,
    })

    const view = client.watches.feedOf(agentId, CONVERSATION_ID)

    expect(view?.items.map((item) => item.id)).toEqual(['e0', 'e1', 'u1', 'a1'])
    expect(view?.hasEarlier).toBe(false)
    expect(JSON.stringify(view)).not.toContain('/Users/')

    // Живая заплатка после страницы - по номеру, как прежде: страница номер не трогала.
    ide.say('a2', 'Still here')
    await until(
      () => client.watches.feedOf(agentId, CONVERSATION_ID)?.items.at(-1)?.id === 'a2',
      'patch after the page',
    )
    expect(client.watches.feedOf(agentId, CONVERSATION_ID)?.items[0]?.id).toBe('e0')
  })

  it('история проекта и продолжение прошлого разговора', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')
    const projectKey = inventory.projects[0]?.key ?? ''
    const history = await client.command(code.agentId, 'conversation.history', {
      projectKey,
      provider: 'claude',
    })

    expect(history).toMatchObject({
      ok: true,
      data: { entries: [{ isOpen: true }, { sessionId: PAST_SESSION, isOpen: false }] },
    })
    expect(JSON.stringify(history)).not.toContain('/Users/')

    const opened = await client.command(code.agentId, 'conversation.openHistory', {
      projectKey,
      provider: 'claude',
      sessionId: PAST_SESSION,
    })

    expect(opened).toEqual({ ok: true, data: { conversationId: `history-${PAST_SESSION}` } })
  })

  it('фото сообщения крупно: маленькое - как есть, большое - уменьшенным в один кадр', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)

    await until(() => lastOf(inbox, 'inventory'), 'inventory')
    ide.ide.images.set('u1:0', imageOf(1000))
    ide.ide.images.set('u1:1', imageOf(3_000_000))

    const small = await client.command(code.agentId, 'conversation.image', {
      conversationId: CONVERSATION_ID,
      messageId: 'u1',
      index: 0,
    })
    const big = await client.command(code.agentId, 'conversation.image', {
      conversationId: CONVERSATION_ID,
      messageId: 'u1',
      index: 1,
    })

    expect(small).toEqual({ ok: true, data: { dataUrl: imageOf(1000), reduced: false } })
    expect(big).toMatchObject({ ok: true, data: { reduced: true } })
  })

  it('доска всех очередей: очереди всех проектов с именем проекта, без путей', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)

    await until(() => lastOf(inbox, 'inventory'), 'inventory')
    client.watch(code.agentId, { kind: 'queues', scope: '*' })

    const board = await until(() => lastOf(inbox, 'queues'), 'all queues')

    expect(board).toMatchObject({
      scope: '*',
      queues: [{ id: 'q1', projectName: 'secret-client' }],
    })
    expect(JSON.stringify(board)).not.toContain('/Users/')
  })

  it('фото частями: сообщение тяжелее кадра собирается в IDE целиком', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)

    await until(() => lastOf(inbox, 'inventory'), 'inventory')

    const data = 'A'.repeat(400_000)
    const sent = await client.command(code.agentId, 'conversation.send', {
      conversationId: CONVERSATION_ID,
      text: 'Look at this',
      images: [{ mediaType: 'image/png', data }],
    })

    expect(sent).toEqual({ ok: true })
    expect(ide.ide.calls).toContainEqual({
      name: 'send',
      args: [CONVERSATION_ID, { text: 'Look at this', images: [{ mediaType: 'image/png', data }] }],
    })
  })

  it('сценарии: запуск в новой очереди и «остановить после текущего»', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')
    const projectKey = inventory.projects[0]?.key ?? ''

    client.watch(code.agentId, { kind: 'queues', scope: projectKey })
    await until(() => lastOf(inbox, 'queues'), 'queues')

    const started = await client.command(code.agentId, 'scenarios.start', {
      projectKey,
      scenarioId: 'tidy',
      scope: 'project',
      inputs: { what: 'src' },
      provider: 'claude',
      target: { kind: 'new', worktree: true },
      afterSuccess: false,
    })

    expect(started).toEqual({ ok: true, data: { queueId: 'q2', itemId: 'i2' } })

    const stopped = await client.command(code.agentId, 'scenarios.queue', {
      queueId: 'q1',
      action: { kind: 'stopAfter', itemId: 'i1' },
    })

    expect(stopped).toEqual({ ok: true })
    await until(
      () => lastOf(inbox, 'queues')?.queues.find((queue) => queue.stopAfterItemId === 'i1'),
      'queue stopping after the current item',
    )
  })

  it('возвращение без QR: та же пара после перезапуска страницы, потом отзыв', async () => {
    const ide = await harness()
    const first = await pairPhone(ide)

    await until(() => lastOf(first.inbox, 'inventory'), 'first inventory')
    first.client.stop()

    // Новая страница с тем же хранилищем: ключ пары тот же, ключи соединения - новые.
    const again = await phone(ide.relayUrl, first.store)

    await until(() => lastOf(again.inbox, 'inventory'), 'inventory after resume')
    expect(again.client.status(first.code.agentId)).toBe('online')

    ide.service.revoke(ide.service.view().devices[0]?.id ?? '')
    await until(() => again.client.status(first.code.agentId) === 'revoked', 'revoked')
    expect(again.client.machines()[0]?.revoked).toBe(true)
  })

  it('Refuse в IDE: телефон слышит «не пустили» под секретом кода и не ждёт молча', async () => {
    const ide = await harness()
    const code = parsePairingFragment(new URL(ide.pairingUrl()).hash)

    if (!code) throw new Error('no code')

    const side = await phone(ide.relayUrl)
    const outcome = side.client.pair(await side.client.preparePairing(code), 'Refused phone')

    await until(() => ide.service.view().pending, 'a phone asking to pair')
    ide.service.refuse()

    expect(await outcome).toEqual({ ok: false, reason: 'refused' })
  })

  it('ответ на снятый вопрос, кнопка прогона и ответ голове с устаревшего экрана - отказ', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId

    await until(() => lastOf(inbox, 'inventory'), 'inventory')

    expect(
      await client.command(agentId, 'conversation.respond', {
        conversationId: CONVERSATION_ID,
        requestId: 'answered-at-the-desk',
        decision: { kind: 'permission', allow: true },
      }),
    ).toEqual({ ok: false, code: 'questionGone', detail: undefined })
    expect(
      await client.command(agentId, 'scenarios.answer', {
        runId: 'r1',
        question: { stepKey: 's1:c1:1', askedAt: 1 },
        allow: true,
        text: '',
      }),
    ).toMatchObject({ ok: false, code: 'questionGone' })
    expect(
      await client.command(agentId, 'scenarios.control', {
        runId: 'r1',
        action: 'resume',
        seen: 'paused',
      }),
    ).toMatchObject({ ok: false, code: 'runMoved' })
    expect(
      await client.command(agentId, 'scenarios.answer', {
        runId: 'r1',
        question: { stepKey: 's1:c1:1', askedAt: 30 },
        allow: true,
        text: 'yes',
      }),
    ).toEqual({ ok: true })
  })

  it('стук получает pong; «тебя отпустили» без верного тега ничего не стирает', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)

    await until(() => lastOf(inbox, 'inventory'), 'inventory')
    client.wake()
    await until(() => lastOf(inbox, 'pong'), 'pong')

    // Слово «отпустили» от адреса IDE, но тег - не её: так мог бы сказать сам релей.
    client.receive({
      version: 1,
      type: FRAME_SEALED,
      to: new Uint8Array(16),
      from: fromBase64Url(code.agentId) ?? new Uint8Array(16),
      counter: 0n,
      body: encodeBody({ p: 1, k: 'revoked', tag: 'AAAA' }),
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(client.status(code.agentId)).toBe('online')
    expect(client.machines()[0]?.revoked).toBe(false)
  })

  it('«забыть IDE» на телефоне - IDE отзывает его у себя тоже', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)

    await until(() => lastOf(inbox, 'inventory'), 'inventory')
    expect(ide.service.view().devices).toHaveLength(1)
    await client.forget(code.agentId)
    await until(() => ide.service.view().devices.length === 0, 'the IDE forgetting the phone')
    expect(client.machines()).toEqual([])
  })

  it('чужой код: доказательство не под тем секретом - IDE молчит, пара не проходит', async () => {
    const ide = await harness()
    const url = new URL(ide.pairingUrl())
    const code = parsePairingFragment(url.hash)

    if (!code) throw new Error('no code')

    const side = await phone(ide.relayUrl)
    const offer = await side.client.preparePairing({ ...code, secret: new Uint8Array(16) })
    const outcome = side.client.pair(offer, 'Wrong secret')

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(ide.service.view().pending).toBeNull()
    side.client.cancelPairing()
    expect(await outcome).toEqual({ ok: false, reason: 'cancelled' })
  })
})
