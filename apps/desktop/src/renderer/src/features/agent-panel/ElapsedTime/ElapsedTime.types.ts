export type ElapsedTimeProps = {
  /** Начало (мс); 0 - неизвестно, ничего не рисуется. */
  startedAt: number
  /** Конец (мс); 0 - ещё идёт: время тикает; равен началу - конец неизвестен. */
  endedAt: number
}
