/** PCM16 моно (байты главного процесса) - в отсчёты Web Audio от -1 до 1. */
export const pcmToFloat = (pcm: Uint8Array): Float32Array<ArrayBuffer> => {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const floats = new Float32Array(samples.length)

  for (let index = 0; index < samples.length; index += 1) {
    floats[index] = (samples[index] ?? 0) / 0x8000
  }

  return floats
}

/**
 * Сыграть кусок PCM16 целиком - образец голоса в настройках. Отдельный AudioContext на образец:
 * закрывается, когда дозвучал, и не держит звуковое устройство.
 */
export const playPcmSample = (pcm: Uint8Array, rate: number): void => {
  const samples = pcmToFloat(pcm)

  if (samples.length === 0) return

  const context = new AudioContext()
  const buffer = context.createBuffer(1, samples.length, rate)
  const source = context.createBufferSource()

  buffer.copyToChannel(samples, 0)
  source.buffer = buffer
  source.connect(context.destination)
  source.onended = () => void context.close()
  source.start()
}
