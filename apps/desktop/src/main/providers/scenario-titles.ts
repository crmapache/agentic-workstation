/**
 * Имя очереди - короткий ответ модели на описание работы; общий вопрос у всех провайдеров.
 * Дольше минуты ждать нечего: без имени очередь называется по первому сценарию.
 */
export const TITLE_MS = 60_000

export const TITLE_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' } },
  required: ['title'],
  additionalProperties: false,
}

export const titlePrompt = (description: string): string =>
  [
    'Give a short name (2 to 5 words, no quotes, no trailing period) to this piece of work,',
    'so a person can tell it apart from other running work at a glance. Answer in the language',
    'of the work description. Reply with JSON only: {"title": "..."}.',
    '',
    description,
  ].join('\n')

/** Имя из ответа модели; не ответила или пусто - null. */
export const titleOf = (output: unknown): string | null => {
  const title =
    typeof output === 'object' && output !== null ? (output as { title?: unknown }).title : null

  return typeof title === 'string' && title.trim() ? title.trim() : null
}
