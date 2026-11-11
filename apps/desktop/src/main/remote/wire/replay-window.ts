/** Окно в 64 номера: столько помещается в слово, а сокет больше не переставляет. */
export const REPLAY_WINDOW = 64n

/**
 * Видели ли кадр раньше. Повтор «разреши этот вызов» - второе разрешение в момент,
 * который никто не выбирал: тег не даёт кадр изменить, а это окно - прислать снова.
 * Окно, а не высшая отметка: после переподключения буфер релея сливается с живым
 * потоком, и порядок плывёт на несколько кадров (как ReplayWindow в ACC).
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
