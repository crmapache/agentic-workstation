import { it, expect, describe } from 'vitest'

import {
  encodeFrame,
  FRAME_PROOF,
  FRAME_SEALED,
  FRAME_CHALLENGE,
} from '@agentic-workstation/remote-protocol/frame'

import type { SocketLike, SocketState } from './relay-socket'
import { RelaySocket } from './relay-socket'

const ADDRESS = new Uint8Array(16).fill(4)

const fakeSocket = () => {
  const sent: Uint8Array[] = []
  const socket: SocketLike & { readyState: number } = {
    binaryType: '',
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data) => sent.push(data),
    close: () => undefined,
  }

  return { socket, sent }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('линия телефона до релея', () => {
  it('открыта только после ответа на вызов: до него не уходит ничего, кроме ответа', async () => {
    const { socket, sent } = fakeSocket()
    const states: SocketState[] = []
    let opened = 0
    const line = new RelaySocket({
      relayUrl: 'wss://relay.example',
      deviceId: 'device',
      address: ADDRESS,
      prove: (challenge) =>
        Promise.resolve(encodeFrame(FRAME_PROOF, new Uint8Array(16), ADDRESS, 0n, challenge)),
      onFrame: () => undefined,
      onOpen: () => (opened += 1),
      onState: (state) => states.push(state),
      createSocket: () => socket,
    })

    line.start()
    socket.readyState = 1
    socket.onopen?.({})
    expect(line.isOpen).toBe(false)
    expect(line.send(encodeFrame(FRAME_SEALED, ADDRESS, ADDRESS, 1n, new Uint8Array(1)))).toBe(
      false,
    )
    expect(sent).toEqual([])

    socket.onmessage?.({
      data: encodeFrame(
        FRAME_CHALLENGE,
        ADDRESS,
        new Uint8Array(16),
        0n,
        new Uint8Array(32).fill(7),
      ).buffer,
    })
    await flush()

    expect(sent).toHaveLength(1)
    expect(sent[0]?.[1]).toBe(FRAME_PROOF)
    expect(line.isOpen).toBe(true)
    expect(states.at(-1)).toBe('open')
    expect(opened).toBe(1)
    expect(line.send(encodeFrame(FRAME_SEALED, ADDRESS, ADDRESS, 1n, new Uint8Array(1)))).toBe(true)
    line.stop()
  })

  it('подпись адреса не сошлась (4003) - больше не звонит сам', () => {
    const { socket } = fakeSocket()
    const states: SocketState[] = []
    const line = new RelaySocket({
      relayUrl: 'wss://relay.example',
      deviceId: 'device',
      address: ADDRESS,
      prove: () => Promise.resolve(new Uint8Array()),
      onFrame: () => undefined,
      onOpen: () => undefined,
      onState: (state) => states.push(state),
      createSocket: () => socket,
    })

    line.start()
    socket.onclose?.({ code: 4003 })
    expect(states.at(-1)).toBe('refused')
    line.stop()
  })
})
