import { it, expect, describe } from 'vitest'

import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'
import type { PushNotice } from '@agentic-workstation/remote-protocol/push'

import en from '../locales/en.json'
import { openPush } from './push-open'
import type { PushStrings } from './push-text'
import { shownPush, GENERIC_TAG } from './push-text'
import { NOTICE, pairedMachine } from './__fixtures__/sealed-push'

/**
 * Половина воркера в пушах: открыть payload ключами пары (WebCrypto, как в браузере) и собрать
 * уведомление словами телефона с адресом экрана. Печать за IDE - по раскладке протокола.
 */

const strings: PushStrings = en.push

describe('открыть пуш ключами пары', () => {
  it('своя IDE: уведомление целиком', async () => {
    const { machine, seal } = await pairedMachine()

    expect(await openPush(await seal(), [machine])).toEqual({
      agentId: machine.agentId,
      notice: NOTICE,
    })
  })

  it('чужая или отпущенная IDE, правленый payload, не уведомление внутри - null', async () => {
    const { machine, seal } = await pairedMachine()
    const other = await pairedMachine()
    const payload = await seal()
    const tampered = payload.slice()

    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 1

    expect(await openPush(payload, [other.machine])).toBeNull()
    expect(await openPush(payload, [{ ...machine, revoked: true }])).toBeNull()
    expect(await openPush(tampered, [machine])).toBeNull()
    expect(await openPush(await seal({ hello: 'world' }), [machine])).toBeNull()
    // Адрес IDE в открытой части - под печатью: подменённый не откроется и ключами той пары.
    const swapped = payload.slice()

    swapped[1] = (swapped[1] ?? 0) ^ 1
    expect(
      await openPush(swapped, [{ ...machine, agentId: toBase64Url(swapped.slice(1, 17)) }]),
    ).toBeNull()
  })
})

describe('уведомление словами телефона', () => {
  const shown = (notice: Partial<PushNotice>) =>
    shownPush(
      { agentId: 'A'.repeat(22), notice: { ...NOTICE, ...notice } },
      strings,
      () => '2:30 PM',
    )

  it('кто, где и что - и экран разговора', () => {
    expect(shown({})).toEqual({
      title: 'Claude in demo needs you',
      body: 'Fix the login bug: allow Bash?',
      tag: `${'A'.repeat(22)}:${NOTICE.tag}`,
      url: `/m/${'A'.repeat(22)}/p/${NOTICE.route.projectKey}/c/${NOTICE.tag.slice(2)}`,
    })
  })

  it('каждый повод - своим заголовком; лимит со сроком и без', () => {
    expect(shown({ reason: 'trouble' }).title).toBe('Claude in demo stopped')
    expect(shown({ reason: 'limit', until: 5 }).body).toBe('Fix the login bug: waits until 2:30 PM')
    expect(shown({ reason: 'limit' }).body).toBe('Fix the login bug: waits for the limit to reset')
    expect(shown({ reason: 'extraUsage' }).title).toBe('Claude in demo uses extra usage')
    expect(shown({ reason: 'plan' }).body).toBe('Fix the login bug: a plan to review')
  })

  it('голова сценария и очередь - экраном прогона и очереди', () => {
    const run = shown({
      reason: 'question',
      title: 'Tidy up',
      tag: 'q-q1',
      route: { screen: 'run', projectKey: NOTICE.route.projectKey, runId: 'r1' },
    })
    const held = shown({
      reason: 'held',
      detail: 'failed',
      title: 'Cleanup',
      tag: 'q-q1',
      route: { screen: 'queue', projectKey: NOTICE.route.projectKey, queueId: 'q1' },
    })

    expect(run).toMatchObject({
      title: 'Scenario in demo needs you',
      body: 'Tidy up: a question for you',
      url: `/m/${'A'.repeat(22)}/p/${NOTICE.route.projectKey}/r/r1`,
    })
    expect(held).toMatchObject({
      title: 'Queue stopped in demo',
      body: 'Cleanup: a scenario failed',
      url: `/m/${'A'.repeat(22)}/p/${NOTICE.route.projectKey}/q/q1`,
    })
    expect(run.tag).toBe(held.tag)
  })

  it('не открылся - общее «IDE ждёт тебя» и главный экран', () => {
    expect(shownPush(null, strings)).toEqual({
      title: 'Agentic Workstation',
      body: 'Your IDE needs you.',
      tag: GENERIC_TAG,
      url: '/',
    })
  })
})
