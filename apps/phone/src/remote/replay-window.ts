/** Окно в 64 номера: столько помещается в слово, а сокет больше не переставляет. */
export const REPLAY_WINDOW = 64n

/**
 * Видели ли кадр IDE раньше. Тег не даёт кадр изменить, а это окно - прислать его снова: повтор
 * «вот твой ответ» после переподключения релей отдаёт из ящика вперемешку с живым потоком.
 * Окно, а не высшая отметка: порядок после обрыва плывёт на несколько кадров. Правило то же,
 * что у IDE (main/remote/wire/replay-window.ts), - оба конца протокола держат его одинаково.
 */
export class ReplayWindow {
  private highest = -1n
  /** Бит 0 - сам highest, бит 1 - номер перед ним и так далее. */
  private seen = 0n

  /** false - уже был или слишком старый, чтобы понять: кадр выбрасывается. */
  accept(counter: bigint): boolean {
    if (counter < 0n) return false

    if (this.highest < 0n) {
      this.highest = counter
      this.seen = 1n

      return true
    }

    if (counter > this.highest) {
      const step = counter - this.highest

      this.seen =
        step >= REPLAY_WINDOW ? 1n : ((this.seen << step) | 1n) & ((1n << REPLAY_WINDOW) - 1n)
      this.highest = counter

      return true
    }

    const behind = this.highest - counter

    // Ниже окна повтор не отличить от очень позднего - угадывать в пользу отправителя нельзя.
    if (behind >= REPLAY_WINDOW) return false

    const bit = 1n << behind

    if ((this.seen & bit) !== 0n) return false

    this.seen |= bit

    return true
  }
}
