/**
 * Ответ ИИ, прочитавшего календарь (ADR 0114). Все поля обязательны, пустое - null: строгий
 * режим Codex (OpenAI) не берёт необязательных полей. Время - как на странице, на её часах:
 * смещение пояса модель в дни перевода часов посчитала бы неверно, пересчёт делает IDE.
 */
const nullableText = { type: ['string', 'null'] }

const EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'start',
    'end',
    'all_day',
    'status',
    'show_as',
    'my_response',
    'join_url',
    'location',
    'organizer',
  ],
  properties: {
    title: { type: 'string' },
    start: {
      type: 'string',
      description: 'Local wall time as the page shows it, YYYY-MM-DDTHH:MM; all-day: YYYY-MM-DD',
    },
    end: {
      type: 'string',
      description: 'Same format; all-day: the day after the last day',
    },
    all_day: { type: 'boolean' },
    status: { type: 'string', enum: ['confirmed', 'tentative', 'cancelled', 'unknown'] },
    show_as: {
      type: 'string',
      enum: ['busy', 'free', 'tentative', 'out_of_office', 'unknown'],
    },
    my_response: {
      type: 'string',
      enum: ['accepted', 'tentative', 'declined', 'not_responded', 'organizer', 'unknown'],
    },
    join_url: { ...nullableText, description: 'Teams, Zoom or Meet link shown on the event' },
    location: nullableText,
    organizer: nullableText,
  },
} as const

export const CALENDAR_AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'time_zone', 'covered_from', 'covered_to', 'note', 'events'],
  properties: {
    status: {
      type: 'string',
      enum: ['ok', 'partial', 'login_required', 'not_found', 'failed'],
    },
    time_zone: {
      type: 'string',
      description: 'IANA time zone the calendar shows times in, for example Europe/Madrid',
    },
    covered_from: { type: 'string', description: 'First day you saw completely, YYYY-MM-DD' },
    covered_to: { type: 'string', description: 'Last day you saw completely, YYYY-MM-DD' },
    note: { type: 'string', description: 'One short sentence: what went wrong, if anything' },
    events: { type: 'array', items: EVENT_SCHEMA },
  },
} as const
