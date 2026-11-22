import { it, expect, describe } from 'vitest'

import { decodeAudio, encodeAudio, isAudioBody, MAX_AUDIO_BYTES } from './audio-frame'
import { encodeBody } from './body'

describe('audio frames', () => {
  it('round-trips a frame and tells it from a JSON body', () => {
    const pcm = new Uint8Array([1, 2, 3, 4])
    const body = encodeAudio({ kind: 'answer', epoch: 3, frame: 70000, pcm })

    expect(isAudioBody(body)).toBe(true)
    expect(isAudioBody(encodeBody({ k: 'ping' }))).toBe(false)
    expect(decodeAudio(body)).toEqual({ kind: 'answer', epoch: 3, frame: 70000, pcm })
  })

  it('carries a reading aloud as its own kind, numbered by the reading', () => {
    const pcm = new Uint8Array([5, 6])
    const body = encodeAudio({ kind: 'reading', epoch: 7, frame: 2, pcm })

    expect(body[0]).toBe(0x03)
    expect(isAudioBody(body)).toBe(true)
    expect(decodeAudio(body)).toEqual({ kind: 'reading', epoch: 7, frame: 2, pcm })
    expect(isAudioBody(new Uint8Array([0x04, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
  })

  it('refuses an odd PCM length and an oversized frame', () => {
    expect(
      decodeAudio(encodeAudio({ kind: 'mic', epoch: 0, frame: 0, pcm: new Uint8Array(3) })),
    ).toBeNull()
    expect(
      decodeAudio(
        encodeAudio({ kind: 'mic', epoch: 0, frame: 0, pcm: new Uint8Array(MAX_AUDIO_BYTES) }),
      ),
    ).toBeNull()
  })
})
