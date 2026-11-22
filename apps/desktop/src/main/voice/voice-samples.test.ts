import { rmSync, utimesSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, describe, afterEach } from 'vitest'

import { VoiceSamples, SAMPLE_KEEP_MS } from './voice-samples'

const dirs: string[] = []
const REQUEST = { language: 'en' as const, voice: 'aura-2-paige-en', speed: 1, text: 'Hi' }
const PCM = new Uint8Array([1, 2, 3, 4])

const samplesIn = (now: () => number = Date.now) => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-samples-'))

  dirs.push(dir)

  return { dir, samples: new VoiceSamples(join(dir, 'samples'), now) }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('VoiceSamples', () => {
  it('синтезирует образец один раз: повторное нажатие играет с диска', async () => {
    const { samples } = samplesIn()
    const synthesize = vi.fn(() => Promise.resolve(PCM))

    expect(await samples.get(REQUEST, synthesize)).toEqual(PCM)
    expect(await samples.get(REQUEST, synthesize)).toEqual(PCM)
    expect(synthesize).toHaveBeenCalledTimes(1)
  })

  it('два нажатия на один голос ждут одного синтеза, другой голос - свой', async () => {
    const { samples } = samplesIn()
    const synthesize = vi.fn(() => Promise.resolve(PCM))

    await Promise.all([samples.get(REQUEST, synthesize), samples.get(REQUEST, synthesize)])
    await samples.get({ ...REQUEST, voice: 'aura-2-olga-ru' }, synthesize)
    await samples.get({ ...REQUEST, speed: 1.2 }, synthesize)

    expect(synthesize).toHaveBeenCalledTimes(3)
  })

  it('неудачный синтез не сохраняется: следующее нажатие пробует снова', async () => {
    const { samples } = samplesIn()
    const synthesize = vi.fn(() => Promise.resolve<Uint8Array | null>(null))

    expect(await samples.get(REQUEST, synthesize)).toBeNull()
    await samples.get(REQUEST, synthesize)

    expect(synthesize).toHaveBeenCalledTimes(2)
  })

  it('образец старше месяца синтезируется заново, а при запуске удаляется', async () => {
    let now = Date.now()
    const { dir, samples } = samplesIn(() => now)
    const synthesize = vi.fn(() => Promise.resolve(PCM))

    await samples.get(REQUEST, synthesize)

    const [name = ''] = readdirSync(join(dir, 'samples'))
    const written = new Date(now - SAMPLE_KEEP_MS - 1000)

    utimesSync(join(dir, 'samples', name), written, written)
    await samples.get(REQUEST, synthesize)
    expect(synthesize).toHaveBeenCalledTimes(2)

    now += SAMPLE_KEEP_MS + 1000
    await samples.prune()
    expect(readdirSync(join(dir, 'samples'))).toEqual([])
  })
})
