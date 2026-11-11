import type { FrameType } from '@agentic-workstation/remote-protocol/frame'
import {
  decodeFrame,
  encodeFrame,
  FRAME_SEALED,
  decodeAddress as decodeAddressBytes,
  encodeAddress as encodeAddressBytes,
} from '@agentic-workstation/remote-protocol/frame'

/**
 * Конверт релея в главном процессе - тот же, что у телефона (packages/remote-protocol), в
 * обёртке Buffer: дальше по коду адреса сравниваются `equals` и уходят в сокет как есть.
 */

export type Envelope = { type: FrameType; to: Buffer; from: Buffer; counter: bigint; body: Buffer }

export const buildFrame = (
  type: FrameType,
  to: Uint8Array,
  from: Uint8Array,
  counter: bigint,
  body: Uint8Array,
): Buffer => Buffer.from(encodeFrame(type, to, from, counter, body))

/** Разобрать кадр; кривой - FrameError из протокола. */
export const parseFrame = (raw: Uint8Array, maxBytes: number): Envelope => {
  const frame = decodeFrame(raw, maxBytes)

  return {
    type: frame.type,
    to: Buffer.from(frame.to),
    from: Buffer.from(frame.from),
    counter: frame.counter,
    body: Buffer.from(frame.body),
  }
}

/** Заголовок без тела - то, что покрывает тег печати (адреса и вид под тегом). */
export const headerOf = (type: FrameType, to: Uint8Array, from: Uint8Array, counter: bigint) =>
  buildFrame(type, to, from, counter, new Uint8Array(0))

export const encodeAddress = (address: Uint8Array): string => encodeAddressBytes(address)

export const decodeAddress = (text: string): Buffer => Buffer.from(decodeAddressBytes(text))

/** Пустое сердцебиение себе: релей вернёт его этой же линией. */
export const heartbeatFrame = (self: Uint8Array): Buffer =>
  buildFrame(FRAME_SEALED, self, self, 0n, new Uint8Array(0))
