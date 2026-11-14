export type RollingLineProps = {
  /** Строка сейчас. Сменилась - старая уезжает вверх, новая приходит снизу. */
  text: string
}

/** Строка на своём месте в смене: номер смены - ключ React, по нему новая не путается со старой. */
export type RollingLineEntry = { text: string; turn: number }
