import type { ScenarioCard, ScenarioStage } from '@shared/scenarios'

/**
 * Что спрашивают у головы о карточке, которая сказала своё: сделано ли, что ответить на её
 * вопрос, нужен ли этапу ещё проход, - и как передают ей работу карточки (HeadTalk в ACC).
 */

const untitled = (title: string) => title.trim() || 'Untitled'

/** Как прочесть несколько концовок: после хука, после фоновых помощников, или помощники не дождались. */
const endingsNote = (count: number, waited: boolean, overdue: boolean): string[] => {
  if (waited && overdue) {
    return [
      'It ended a turn while helpers it had started in the background were still at work, and their reports set it going again. The panel stopped waiting before all of them had reported: a command one of them had started was still running after half an hour, so its report has not come. What it said at every ending is here, in order, and the last may be the card still waiting rather than its report.',
      '',
    ]
  }

  if (waited) {
    return [
      'It ended a turn while helpers it had started in the background were still at work. Their reports set it going again, and the panel waited until every one of them had reported, so what it said at every ending is here, in order. Read them together: the last is where it finally stopped, and it usually holds the report.',
      '',
    ]
  }

  if (count > 1) {
    return [
      `It meant to end its turn ${count} times. Each time but the last, a hook of the project sent it back to work, so what it said at every ending is here, in order. Read them together: the report is usually the first, and the last is only what it did after the hook.`,
      '',
    ]
  }

  return []
}

/** Вердикт по карточке, чей ход кончился. */
export const verdictRequest = (options: {
  card: ScenarioCard
  endings: readonly string[]
  ok: boolean
  nudgesLeft: number
  handsOver: boolean
  waited: boolean
  overdue: boolean
  putOff: boolean
}): string => {
  const { card } = options
  const said = options.endings.filter((ending) => ending.trim())
  const lines = [
    options.ok
      ? 'The card’s turn is over. This is what it said:'
      : 'The card’s turn ended badly. This is what came back:',
    '',
    ...endingsNote(said.length, options.waited, options.overdue),
    ...said.flatMap((ending, index) => [
      said.length > 1 ? `--- ending ${index + 1} of ${said.length}` : '---',
      ending,
    ]),
    ...(said.length === 0 ? ['---', '(it said nothing at all)'] : []),
    '---',
    '',
    'Judge it against its definition of done:',
    '',
    card.dod.trim() || '(nothing written - the turn ending without an error is enough)',
    ...(card.after.trim()
      ? [
          '',
          'And do what the card’s "after the card" line asks, if you can do it by looking:',
          '',
          card.after.trim(),
        ]
      : []),
    '',
    'Answer with one of these:',
    '',
    '- `{"done": true, "reason": "...", "handoff": "..."}` - it is finished. `handoff` is what the cards after this one need: the path it wrote, the number it found, the decision it took. That is the only thing that travels forward, so write it out rather than referring to it.',
  ]

  if (options.nudgesLeft > 0) {
    lines.push(
      `- \`{"retry": "..."}\` - send it back to work. \`retry\` is said into the same session, which remembers everything it already did, so say exactly what is missing and do not repeat the task at it. ${options.nudgesLeft} go(es) left.`,
    )
  }

  if (options.putOff) {
    lines.push(
      '- `{"later": "..."}` - it could not get its item done now, for a reason that may pass: a service that would not let it in, something an item later in the list has to finish first. The item gets one more go, in fresh sessions, once the rest of the list is done. `later` is what that go is told about this one. Once per item - a second go is done or not.',
    )
  }

  if (options.handsOver) {
    lines.push(
      '- `{"done": false, "reason": "..."}` - its session cannot finish it. This scenario hands the work to you next: you will finish it yourself, with the tools every card has, before the run moves on.',
      '- `{"done": false, "stop": true, "reason": "..."}` - it stopped where the briefing says nobody but a person may go on. The run stops here, and nobody takes the card over.',
    )
  } else {
    lines.push(
      '- `{"done": false, "reason": "..."}` - give up on it. The run stops here, because everything after this card was written on the assumption that it happened.',
    )
  }

  return lines.join('\n')
}

/**
 * Работа карточки - голове (takeOverRequest в ACC). Роль снимается здесь, в разговоре: абзац
 * системного промпта проигрывает транскрипту, который весь про обратное. said - последние
 * слова карточки, если голова их не видела (потолок, падение); null - они в запросе вердикта.
 */
export const takeOverRequest = (options: {
  card: ScenarioCard
  prompt: string
  why: string
  said: string | null
  transcript: string | null
}): string =>
  [
    '# You are finishing this card yourself',
    '',
    `The card "${untitled(options.card.title)}" did not get to its definition of done: ${options.why || 'it said nothing about why'}`,
    '',
    'Its session is closed. This scenario hands such a card to you rather than ending the run, so from this message until you answer with the object below, you do its work yourself. For this card only, the rule that the main thread never writes to disk is lifted: you have the tools and the trust every card of this run has, and you edit files, run commands and commit exactly as the card would have.',
    '',
    'Do not start the card over. What it has done so far is on the disk - look at it first (git status, git log, the files it wrote) and carry on from the first thing that is not done.',
    ...(options.said === null
      ? ['What it said last is in the message that asked you for your verdict.']
      : [
          '',
          'What it was saying when it stopped:',
          '',
          '---',
          options.said || '(nothing at all)',
          '---',
        ]),
    ...(options.transcript
      ? [
          '',
          `Its whole conversation, every tool call included, is in ${options.transcript} - read it if what it did is not clear from the disk.`,
        ]
      : []),
    '',
    '## What its session was told',
    '',
    '```',
    options.prompt,
    '```',
    '',
    '## Its definition of done',
    '',
    options.card.dod.trim() ||
      '(nothing written - the work the prompt asks for being done is enough)',
    '',
    'The briefing still holds. Where it names a stop that is not yours to get past, that stays a stop for you as well: answer that it is not done at once, with the reason, and change nothing.',
    '',
    'Finish within this turn. Whatever you start - a build, a check, a wait for CI - wait for it here with a blocking call rather than in the background: the moment your turn ends, what you said is read as your answer.',
    '',
    'When you are finished, say in one or two sentences what you did, then answer with one of these:',
    '',
    '- `{"done": true, "reason": "...", "handoff": "..."}` - it is finished. `handoff` is what the cards after this one need, written out rather than referred to.',
    '- `{"done": false, "reason": "..."}` - you could not finish it either. The run stops here.',
    '',
    'Once you have answered you are the main thread again: the next card goes to a session of its own.',
  ].join('\n')

/** Вопрос карточки - голове: решить так, как решил бы тот, кто писал прогон. */
export const questionRequest = (
  title: string,
  tool: string,
  detail: string,
  options: readonly string[],
): string =>
  [
    'The card has stopped and is waiting for an answer. Its turn is still open - one answer carries it on.',
    '',
    `It wants: ${title || tool}`,
    `Tool: ${tool}`,
    ...(options.length > 0 ? [`The answers it offered: ${options.join(' / ')}`] : []),
    '',
    'What it asked with:',
    '```json',
    detail,
    '```',
    '',
    'Decide the way the person who wrote this run would have: the briefing is what they told you, and the card is what they asked for. Refuse what goes past either, and say why - the refusal is read by the card and it will work around it.',
    '',
    'Answer with `{"allow": true|false, "answer": "..."}`.',
  ].join('\n')

/** Конец прохода этапа «пока не готово»: нужен ли ещё проход. */
export const anotherPassRequest = (stage: ScenarioStage, pass: number, passes: number): string =>
  [
    `Pass ${pass} of the stage "${stage.title}" is finished, and this stage runs again only while it is worth running - up to ${passes} passes.`,
    '',
    'Another pass runs the same cards again in fresh sessions. Ask for one only if there is work left that another pass would actually do; a pass that finds nothing costs a person’s subscription and their time.',
    '',
    'Answer with `{"again": true|false, "reason": "..."}`.',
  ].join('\n')
