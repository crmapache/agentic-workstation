export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

/**
 * Права Google по типу коннектора. Gmail - modify: чтение, черновики, метки, корзина (без
 * удаления насовсем); отправку закрывает ступень outbound шлюза, отдельного права «только
 * черновики» у Google нет. Calendar - события и чтение календарей (список, занятость).
 */
export const GOOGLE_SCOPES = {
  gmail: ['https://www.googleapis.com/auth/gmail.modify'],
  calendar: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
  ],
} as const
