/** PCM16 моно (байты главного процесса) - в отсчёты Web Audio от -1 до 1. */
export const pcmToFloat = (pcm: Uint8Array): Float32Array<ArrayBuffer> => {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const floats = new Float32Array(samples.length)

  for (let index = 0; index < samples.length; index += 1) {
    floats[index] = (samples[index] ?? 0) / 0x8000
  }

  return floats
}

/** Кусок ответа на шкале AudioContext: с какой секунды и сколько секунд звучит. */
export type PlayedSegment = { start: number; duration: number }

/**
 * Сколько миллисекунд эпохи реально прозвучало к моменту now: по кускам, а не от начала
 * первого - пауза, пока следующий кусок опаздывал, проигранным не считается.
 */
export const playedMs = (segments: readonly PlayedSegment[], now: number): number =>
  segments.reduce(
    (sum, { start, duration }) => sum + Math.min(duration, Math.max(0, now - start)) * 1000,
    0,
  )
