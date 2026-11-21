/** Дни срока по-английски, как весь интерфейс: «Fri», «Tue, Dec 1». */
export const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

export const WEEKDAY_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
