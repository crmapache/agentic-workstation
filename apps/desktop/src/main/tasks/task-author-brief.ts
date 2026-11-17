import { GOAL_BUDGETS, GOAL_LIFE_DAYS } from '@shared/goals'
import { TASK_KINDS, TASK_REPEATS } from '@shared/tasks'

/**
 * Слова, которыми IDE просит модель написать задание из фразы человека, и форма ответа. По-
 * английски: это слова модели, а не интерфейс. Отправка людям без кнопки человека (free)
 * поручению не предлагается вовсе: такую свободу даёт только сам человек в форме.
 */

/** Коннектор, которым прогоны проекта могут пользоваться: имя сервера и что это. */
export type AuthorConnector = { server: string; title: string; description: string }

/** Что знает автор, кроме фразы: проект, его коннекторы и сейчас. */
export type AuthorContext = {
  projectName: string
  projectPath: string
  connectors: readonly AuthorConnector[]
  now: Date
}

/** Исходящие поручения, из которых выбирает модель: только с участием человека. */
export const AUTHOR_OUTBOUNDS = ['confirm', 'drafts'] as const

/** Ответ по схеме: CLI вернёт готовый объект. Числа и время проверяет разбор, а не схема. */
export const AUTHOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: TASK_KINDS },
    name: { type: 'string' },
    prompt: { type: 'string' },
    repeat: { type: 'string', enum: TASK_REPEATS },
    time: { type: 'string', description: 'HH:MM, 24-hour, local time' },
    days: { type: 'array', items: { type: 'integer' } },
    monthDay: { type: 'integer' },
    date: { type: 'string', description: 'YYYY-MM-DD or empty' },
    catchUp: { type: 'boolean' },
    report: { type: 'boolean' },
    lifeDays: { type: 'integer', enum: GOAL_LIFE_DAYS },
    budgetUsd: { type: 'number', enum: GOAL_BUDGETS },
    outbound: { type: 'string', enum: AUTHOR_OUTBOUNDS },
  },
  required: [
    'kind',
    'name',
    'prompt',
    'repeat',
    'time',
    'days',
    'monthDay',
    'date',
    'catchUp',
    'report',
    'lifeDays',
    'budgetUsd',
    'outbound',
  ],
}

const RULES = [
  'You turn a request of a person into a task for Agentic Workstation, an IDE that runs AI tasks on its own. Answer only with the object in the given shape.',
  '',
  'How tasks run:',
  '- A task belongs to one project folder. Each run is a fresh Claude Code conversation in that folder with nobody at the keyboard. It reads the project CLAUDE.md and can use the connectors listed below, files and the shell.',
  '- The run is already told that nobody watches it, that questions reach the person as notifications with buttons, and that it ends with a short report. Do not repeat that in the prompt.',
  '- kind "schedule": runs on its schedule or when started by hand; every run starts from scratch and remembers nothing from earlier runs except what it can read.',
  '- kind "goal": an errand that keeps going until a result. It works, then sleeps until an event (a reply in a connector, a change on a page, a date) while the IDE watches cheaply, and wakes to continue. Choose it for "wait until X, then do Y" or "keep at it until it is done"; otherwise choose "schedule".',
  '',
  'Fields:',
  '- name: 2 to 5 words, no quotes, no trailing period, in the language of the request.',
  '- prompt: the whole instruction for the run, in the language of the request; the run sees nothing else. Say what to do, step by step where order matters; where to look (which connector, which files); what result to produce and where to put it; what the final report must contain. For a goal, say what result counts as done and what to wait for. Name connectors by what they are (Gmail, Calendar), not by server names. Never let the run send messages, emails or comments to other people unless the request asks for it, and then prefer drafts. Do not invent facts about the person. Do not put the schedule into the prompt. Write plain hyphens (-), never long dashes.',
  '- repeat: "manual" (only when started by hand) when the request gives no rhythm and no time; "once" for one run at a date and time; "hourly" (time gives the minute of the hour); "daily"; "weekly" with days; "monthly" with monthDay.',
  '- time: "HH:MM", 24-hour, local time. No time given: "09:00".',
  '- days: for weekly, 1 is Monday and 7 is Sunday; otherwise [1, 2, 3, 4, 5].',
  '- monthDay: for monthly, 1 to 31, where 31 means the last day of the month; otherwise 1.',
  '- date: for once, "YYYY-MM-DD"; otherwise "".',
  '- For kind "goal": repeat "manual"; the other schedule fields keep their defaults.',
  '- catchUp: true when a run missed while the computer slept or the IDE was closed should still happen once later (digests, reports, checks); false when the run only makes sense at its exact time.',
  '- report: true; false only when the person says they want no report.',
  '- lifeDays, budgetUsd, outbound: limits of a goal. lifeDays - how many days to keep trying without a result. budgetUsd - the most the whole goal may spend. outbound - "drafts" when messages to people should stay drafts the person sends, "confirm" when each message waits for the person to press a button. For kind "schedule" use 7, 5 and "confirm".',
].join('\n')

const DAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const pad = (value: number) => String(value).padStart(2, '0')

/** Сейчас - днём недели, датой в форме ответа и часами: «завтра в девять» считается от него. */
const nowLine = (now: Date) =>
  [
    `Now: ${DAY.format(now)} (${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}),`,
    `${pad(now.getHours())}:${pad(now.getMinutes())} local time`,
    `(${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
  ].join(' ')

const connectorLines = (connectors: readonly AuthorConnector[]) =>
  connectors.length === 0
    ? ['- none: only files and the shell.']
    : connectors.map(({ server, title, description }) =>
        description ? `- ${title} (${server}): ${description}` : `- ${title} (${server})`,
      )

/** Вопрос автору целиком: правила, проект, коннекторы, сейчас и сама фраза в ограде. */
export const authorPrompt = (description: string, context: AuthorContext): string =>
  [
    RULES,
    '',
    `Project: ${context.projectName} (${context.projectPath}).`,
    nowLine(context.now),
    '',
    'Connectors the runs of this project can use:',
    ...connectorLines(context.connectors),
    '',
    'The request, word for word:',
    '<request>',
    description,
    '</request>',
  ].join('\n')
