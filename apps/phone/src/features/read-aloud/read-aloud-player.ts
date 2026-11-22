import { ReadingPlayer } from '@agentic-workstation/voice-audio/reading-player'

/**
 * Динамик чтения страницы - один на всё: его создаёт кнопка в нажатии (Safari даёт звучать
 * только звуку, начатому человеком), куски кладёт хост чтения, гасят кнопка и хост.
 */
let playing: { ref: string; player: ReadingPlayer } | null = null

/** Новое чтение: прежнее замолкает. onEnded - когда этот звук дозвучал сам. */
export const startReadingPlayer = (ref: string, onEnded: () => void): void => {
  playing?.player.stop()
  playing = { ref, player: new ReadingPlayer(onEnded) }
}

/** Динамик чтения ref; чтение уже другое или кончилось - null. */
export const readingPlayerOf = (ref: string): ReadingPlayer | null =>
  playing?.ref === ref ? playing.player : null

/** Тишина у чтения ref (стоп, отказ, срыв); чужое не трогается. */
export const stopReadingPlayer = (ref: string): void => {
  if (playing?.ref !== ref) return

  playing.player.stop()
  playing = null
}
