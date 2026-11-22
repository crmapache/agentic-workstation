import { it, vi, expect, describe } from 'vitest'

import type { VoiceReadRefusal } from '@shared/voice-reading'

import type { VoiceMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { decodeAudio } from '@agentic-workstation/remote-protocol/audio-frame'

import type { ReadRequest } from '../../voice/reading/voice-reader'
import { PhoneReadings } from './phone-reading'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const setup = (refusal: VoiceReadRefusal | null = null, text: string | null = 'Почта пуста.') => {
  const sent: VoiceMessage[] = []
  const streamed: Uint8Array[] = []
  const requests: ReadRequest[] = []
  const stopReading = vi.fn()
  const readings = new PhoneReadings({
    voice: {
      read: (request) => {
        requests.push(request)

        return refusal
      },
      stopReading,
    },
    answerText: (conversationId, itemId) =>
      Promise.resolve(conversationId === 'c1' && itemId === 'a1' ? text : null),
    send: (_deviceId, message) => sent.push(message),
    stream: (_deviceId, body) => streamed.push(body),
    timer: () => () => undefined,
  })

  return { readings, sent, streamed, requests, stopReading }
}

const ask = (over: Partial<{ ref: string; n: number; itemId: string }> = {}) =>
  ({
    p: 1,
    k: 'voice',
    act: 'read',
    ref: 'r1',
    n: 4,
    conversationId: 'c1',
    itemId: 'a1',
    ...over,
  }) as const

describe('PhoneReadings', () => {
  it('reads the answer from the IDE feed and sends its sound as reading frames, then the end', async () => {
    const { readings, sent, streamed, requests } = setup()

    await readings.read('phone', ask())

    expect(requests[0]).toMatchObject({ id: 'r1', owner: 'phone:phone', text: 'Почта пуста.' })

    requests[0]?.sink.audio(new Uint8Array(4800))
    requests[0]?.sink.end('done')

    expect(streamed.map((body) => decodeAudio(body))).toEqual([
      expect.objectContaining({ kind: 'reading', epoch: 4, frame: 0 }),
    ])
    expect(sent.at(-1)?.event).toEqual({ kind: 'reading', ref: 'r1', outcome: 'done' })
  })

  it('says why when there is no such answer or the IDE refuses', async () => {
    const missing = setup()

    await missing.readings.read('phone', ask({ itemId: 'gone' }))
    expect(missing.sent.at(-1)?.event).toEqual({
      kind: 'reading',
      ref: 'r1',
      outcome: 'refused',
      reason: 'missing',
    })

    const busy = setup('call')

    await busy.readings.read('phone', ask())
    expect(busy.sent.at(-1)?.event).toMatchObject({ outcome: 'refused', reason: 'call' })
  })

  it('stops only its own reading, and a new one stops the one before', async () => {
    const { readings, stopReading } = setup()

    await readings.read('phone', ask())
    readings.stop('phone', 'other')
    expect(stopReading).not.toHaveBeenCalled()

    await readings.read('phone', ask({ ref: 'r2' }))
    expect(stopReading).toHaveBeenCalledWith('phone:phone', 'r1')

    readings.stop('phone', 'r2')
    expect(stopReading).toHaveBeenLastCalledWith('phone:phone', 'r2')
  })

  it('does not start a reading stopped while its text was being looked up', async () => {
    const { readings, requests } = setup()
    const pending = readings.read('phone', ask())

    readings.stop('phone', 'r1')
    await pending
    await settle()

    expect(requests).toEqual([])
  })
})
