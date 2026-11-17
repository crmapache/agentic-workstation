import type { TaskTrigger } from '@shared/tasks'

/**
 * Слова, которыми IDE говорит с моделью прогона задания: брифинг (`--append-system-prompt`,
 * одной строкой без кавычек) и сообщения поверх разговора. По-английски: это слова модели, а
 * не интерфейс человека.
 */

const when = (at: number) =>
  new Date(at).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const TRIGGER_NOTES: Record<TaskTrigger, (due: number) => string> = {
  schedule: () => 'It started on its schedule.',
  catchUp: (due) =>
    `It was due ${when(due)}, but the computer was asleep or the IDE was closed then, so it runs now to catch up.`,
  manual: () => 'The person started it by hand.',
  reply: () => 'It continues an earlier run of this task.',
}

/** Брифинг прогона: кто ты, что человек не смотрит, как его позвать и чем закончить. */
export const taskBriefing = (name: string, trigger: TaskTrigger, due: number, now: number) =>
  [
    `You are running the scheduled task «${name}» in Agentic Workstation, ${when(now)}.`,
    TRIGGER_NOTES[trigger](due),
    'Nobody watches this conversation live.',
    'If you need a decision from the person, ask with AskUserQuestion: the question reaches them as a notification with buttons, and the run waits for the answer.',
    'To give them something to act on (open a file, a link, a choice that continues this conversation), use the notify tool of the notifications server; set the at argument for a reminder later.',
    'End with a short report in the language of the task: what you did, the result, and anything that needs their attention. It is shown as the run report.',
  ]
    .join(' ')
    .replace(/[\n\r"]/g, ' ')

/** Человек нажал кнопку уведомления, которое прислал этот разговор. */
export const pressedNote = (title: string, label: string, said: string) =>
  [
    `The person pressed «${label}» on your notification «${title}».`,
    said.trim() ? `They wrote: ${said.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')

/** Прогон оборвался (IDE закрылась) - человек просит продолжить. */
export const RESUME_NOTE =
  'The run was interrupted before it finished (the IDE closed). Continue the task from where you stopped, then end with the report.'
