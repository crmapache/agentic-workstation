/** Время записи журнала: часы, минуты, секунды - без даты, журнал живёт до выхода из IDE. */
export const LOG_TIME = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Сколько последних записей журнала видно в окне. */
export const LOG_SHOWN = 80
