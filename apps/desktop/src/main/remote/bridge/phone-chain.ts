/**
 * Просьбы одного телефона - строго по очереди, пока телефон тот же. Очередь нужна там, где
 * порядок что-то значит: «смотри разговор» и следом «не смотри» наперегонки оставили бы не ту
 * подписку, а команда должна начаться после того, что пришло раньше неё. Отзыв телефона,
 * выключение Remote Control и выход из IDE отменяют всё, что ещё ждёт: поколение телефона
 * растёт, и шаг, поставленный при старом поколении, не выполняется.
 */
export class PhoneChains {
  private readonly chains = new Map<string, Promise<void>>()
  private readonly generations = new Map<string, number>()
  private stopped = false

  /** known - телефон всё ещё спарен и с ключами: отпущенному ничего не выполняется. */
  constructor(private readonly known: (deviceId: string) => boolean) {}

  /** Встать в очередь телефона; шаг выполнится, только если телефон к тому времени тот же. */
  run(deviceId: string, work: () => Promise<void> | void): void {
    const still = this.ticket(deviceId)
    const tail = (this.chains.get(deviceId) ?? Promise.resolve())
      .then(() => (still() ? work() : undefined))
      .catch((error: unknown) => console.warn('[remote] просьба телефона не выполнилась:', error))

    this.chains.set(deviceId, tail)
    // Отработавшая очередь не держит память: хвост убирается, если за ним никто не встал.
    void tail.then(() => {
      if (this.chains.get(deviceId) === tail) this.chains.delete(deviceId)
    })
  }

  /**
   * Метка «телефон тот же, мост жив» на момент вызова - для работы, которая кончится позже
   * очереди (итог долгой команды): отпущенному телефону итог не шлётся.
   */
  ticket(deviceId: string): () => boolean {
    const generation = this.generations.get(deviceId) ?? 0

    return () =>
      !this.stopped && (this.generations.get(deviceId) ?? 0) === generation && this.known(deviceId)
  }

  /** Телефон отпущен: всё, что он просил и что ещё ждёт, не выполнится. */
  cancel(deviceId: string): void {
    this.generations.set(deviceId, (this.generations.get(deviceId) ?? 0) + 1)
    this.chains.delete(deviceId)
  }

  /** Мост гаснет (Remote Control выключен, IDE закрывается): ни один шаг больше не начнётся. */
  stop(): void {
    this.stopped = true
    this.chains.clear()
  }
}
