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
