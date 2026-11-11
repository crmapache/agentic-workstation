import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import type { PhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'

import { Bridge } from '../bridge/bridge'
import type { Lane } from '../link/outbox'
import { fakeIde } from './fake-ide'
import { until } from './webcrypto-phone'

/**
 * Мост на подделках сервисов IDE и подделке агента: что ушло телефону и какой очередью, кто
 * на связи и кто спарен - руками теста.
 */

export const PHONE = 'P'.repeat(22)

export const OTHER_PHONE = 'Q'.repeat(22)

export const HOME = '/Users/someone'

export type Sent = { deviceId: string; message: AgentMessage; lane: Lane }

const bridges: Bridge[] = []

export const stopBridges = (): void => {
  for (const bridge of bridges.splice(0)) bridge.stop()
}

export const bridgeSetup = () => {
  const ide = fakeIde()
  const log: Sent[] = []
  const awake = new Set([PHONE, OTHER_PHONE])
  const known = new Set([PHONE, OTHER_PHONE])
  const bridge = new Bridge({
    ports: ide.ports,
    send: (deviceId, message, lane = 'normal') => {
      if (!known.has(deviceId)) return false

      log.push({ deviceId, message, lane })

      return true
    },
    onTheLine: () => new Set([...awake].filter((id) => known.has(id))),
    awake: (deviceId) => awake.has(deviceId),
    known: (deviceId) => known.has(deviceId),
    machine: () => ({ label: 'Agentic Workstation on test', ideVersion: '0.1.0' }),
    home: HOME,
    epoch: 'epoch-1',
  })
  /** Что ушло этому телефону (по умолчанию - первому). */
  const sentTo = (deviceId = PHONE) =>
    log.filter((entry) => entry.deviceId === deviceId).map((entry) => entry.message)
  const say = (message: Omit<PhoneMessage, 'p'> & Record<string, unknown>, deviceId = PHONE) =>
    bridge.handle(deviceId, { p: 1, ...message } as PhoneMessage)
  const next = <K extends AgentMessage['k']>(kind: K, from = 0, deviceId = PHONE) =>
    until(
      () =>
        sentTo(deviceId)
          .slice(from)
          .find((message): message is Extract<AgentMessage, { k: K }> => message.k === kind),
      kind,
    )
  const resultOf = (id: string, deviceId = PHONE) =>
    until(
      () =>
        sentTo(deviceId).find(
          (message): message is Extract<AgentMessage, { k: 'result' }> =>
            message.k === 'result' && message.id === id,
        ),
      `result ${id}`,
    )
  let counter = 0
  const command = (name: string, args: unknown, id = `c${(counter += 1)}`) => {
    say({ k: 'cmd', id, name, args })

    return resultOf(id)
  }

  bridges.push(bridge)

  return { ide, log, sentTo, bridge, say, next, command, resultOf, awake, known }
}

/** Обещание, которое тест отпускает сам: долгая команда, медленный транскрипт. */
export const gate = <T>() => {
  let release: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })

  return { promise, release }
}

/** Пусть отработают обещания и таймеры текущего такта. */
export const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))
