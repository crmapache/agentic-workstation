import { MINUTE_MS, SECOND_MS } from '@shared/time-units'

/**
 * Сколько ждать хода ИИ: он читает документацию по сети, но не вечно. Описание Open-Meteo
 * строилось 80-120 секунд, у сервисов с большой документацией дольше (ADR 0029).
 */
export const TURN_TIMEOUT_MS = 10 * MINUTE_MS

/** Сколько ждать конца хода после остановки по сроку: дальше процесс гасится вместе с разговором. */
export const STOP_GRACE_MS = 30 * SECOND_MS
