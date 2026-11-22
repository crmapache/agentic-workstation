import type { VoiceCue, VoiceOrigin } from '@shared/voice'

/**
 * Тот, кто держит микрофон и динамик звонка: окно IDE или телефон через релей. Звонку всё равно,
 * кто: звук ответа - кадрами с эпохой и номером, остальное - сигналами.
 *
 * Эпоха - непрерывный поток ответа. Перебили - звонок начинает новую эпоху (stopPlayback), и
 * конечная точка выкидывает непроигранное и всё, что ещё летит со старой: кадр несёт эпоху.
 * Проигранное конечная точка считает от начала эпохи и сообщает звонку (played).
 */
export type VoiceEndpoint = {
  origin: VoiceOrigin
  play: (pcm: Buffer, epoch: number, frame: number) => void
  cue: (cue: VoiceCue) => void
}
