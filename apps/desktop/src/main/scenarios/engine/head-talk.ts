import { slotsToFill } from '@shared/scenario-rules'
import type { RunItem } from '@shared/scenario-runs'
import type { Scenario, StageEach, ScenarioCard, ScenarioStage } from '@shared/scenarios'
import { MAX_STAGE_ITEMS } from '@shared/scenarios'

/**
 * Что говорят голове перед карточкой (HeadTalk в ACC). Брифинги запуска - одной строкой без
 * кавычек: это аргумент `--append-system-prompt`, а кавычка или перевод строки режут команду.
 * Всё, у чего есть форма, говорится сообщением. Каждое сообщение кончается объектом, которого
 * от головы ждут; фразы перед объектом - то единственное в её мыслях, что читают утром.
 */

/** Брифинг головы: она судит, а не делает. */
export const HEAD_BRIEFING =
  'You are the main thread of a scenario run in the Claude Code panel of Amazing IDE. Nobody watches this conversation as it is written: it is read afterwards, in the timeline of the run. You do not do the work yourself - each step of the scenario is carried out by a separate Claude Code session in the same project, and you decide what to tell it and whether what came back is what was asked for. Answer every message with one or two sentences for the person, then a fenced json block holding exactly the object that message asks for.'

/** Брифинг головы, доделывающей карточку сама: обычный говорит обратное, и спорил бы с работой. */
export const TAKE_OVER_BRIEFING =
  'You are the main thread of a scenario run in the Claude Code panel of Amazing IDE, and for now you are finishing the work of one card yourself, because its own session could not. Nobody watches this conversation as it is written. For this card you have the tools and the trust every card of the run has, within what the briefing allows. When the work is done, or cannot be, end with one or two sentences for the person, then a fenced json block holding exactly the object the message handing you the card asked for.'

/** Брифинг карточки: обычная задача в обычном репозитории и одна невидимая ей деталь машины. */
export const CARD_BRIEFING =
  'This turn is one step of a scenario run by the Claude Code panel of Amazing IDE. Nobody sits in front of this session. Another Claude session runs the scenario: it gave you this task, it reads your answer, and it decides whether the step is done - so finish by saying plainly what you did and what came of it, because that answer is all it sees. If you need a decision the task does not cover, ask for it: the main thread answers quickly. A command you run in the background is not waited for: if you need what it returns, wait for it before you end your turn.'

/** Сколько причины первого захода говорят второму - аргументом запуска, одной строкой. */
export const AGAIN_CHARS = 600

/** Брифинг карточки; второму заходу пункта - что встретил первый (кавычки - типографские). */
export const cardBriefing = (again: string): string => {
  if (!again.trim()) return CARD_BRIEFING

  const reason = again
    .replaceAll('"', '”')
    .replaceAll("'", '’')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
  const cut = reason.length <= AGAIN_CHARS ? reason : `${reason.slice(0, AGAIN_CHARS)}...`

  return `${CARD_BRIEFING} This is a second go at this task: an earlier go did not finish it, and the main thread put it off until the rest of the list was done. What the earlier go ran into: ${cut} - look at what it left behind before you start anything over.`
}

const untitled = (title: string) => title.trim() || 'Untitled'

/** Первое сообщение прогона: для чего он, как устроена доска и что отвечать. */
export const openingMessage = (
  scenario: Scenario,
  projectPath: string,
  inputs: Readonly<Record<string, string>>,
  total: number,
): string => {
  const lists = scenario.stages.filter((stage) => stage.each)
  const names = lists.map((stage) => `The stage "${untitled(stage.title)}"`).join(' and ')
  const lines = [
    '# The run you are the main thread of',
    '',
    '## What this run is for',
    '',
    scenario.head.briefing.trim() || '(Nothing was written here. Go by the steps themselves.)',
    '',
    '## How this works',
    '',
    'The round of work is stages, and a stage holds cards. The panel walks that shape itself and hands you exactly one card at a time, in order. You cannot reach the others and are not meant to: the timeline on the screen is what happens. Do not ask for a card you have not been handed, and do not do a card’s work yourself - you have no Write and no Edit here.',
    ...(scenario.head.onGiveUp === 'head'
      ? [
          '',
          'One exception, and it is this scenario’s choice: a card its own session could not finish is handed to you, and then you do its work yourself before the run moves on. You will be told so in as many words when it happens, and not before.',
        ]
      : []),
    '',
    'For each card you will be asked, in this order:',
    '',
    '1. **What to put in its slots** - from what the cards before it found out.',
    '2. **What to do about a question it stopped on**, if it stops on one.',
    '3. **Whether it is done**, once its turn is over, judged against its definition of done.',
    '',
    ...(lists.length > 0
      ? [
          `${names} ${lists.length === 1 ? 'runs' : 'run'} once for each item of a list rather than a set number of times. As such a stage begins, before any of its cards, you will be asked one thing more: the list itself, once. The panel then gives the stage exactly one pass per item and writes each item into its pass.`,
          '',
        ]
      : []),
    'Every message ends by naming the json object it wants back. Answer with one or two sentences first - they are shown to the person in the timeline, so say what you decided and why - and then the object in a ```json fence. Nothing else.',
    '',
    '## This run',
    '',
    `- Project folder: ${projectPath}`,
    lists.length === 0
      ? `- Cards to get through: ${total}`
      : `- Cards to get through: ${total} for now, counting one pass of every stage that runs per item - the count grows by its list once you have given it`,
    '',
    ...(scenario.inputs.length > 0
      ? [
          'What the person answered before pressing play. These are already written into the card prompts, so this is for your understanding rather than for pasting:',
          '',
          ...scenario.inputs.map(
            (input) => `- ${input.name}: ${inputs[input.name]?.trim() || '(left empty)'}`,
          ),
          '',
        ]
      : []),
    'Say you have read this, and answer with `{"ready": true}`.',
  ]

  return lines.join('\n')
}

/** Список этапа «по пункту» - один раз, когда этап начинается; промпты карточек - с ним. */
export const listRequest = (
  stage: ScenarioStage,
  each: StageEach,
  number: number,
  stages: number,
  prompts: readonly { card: ScenarioCard; prompt: string }[],
): string =>
  [
    `# Stage ${number} of ${stages} - ${untitled(stage.title)}: its list`,
    '',
    `This stage runs once for each item of a list, and the list is yours to give - now, once, before any of its cards starts. Each item becomes a pass of its own: its cards run in fresh sessions, with \`[[${each.name}]]\` in their prompts replaced by the item’s value. The screen draws one row per item, so give every item that belongs on the list and nothing else, in the order the passes should run.`,
    '',
    '## What the list is',
    '',
    each.description.trim() || '(Nothing was written. Go by the cards themselves.)',
    '',
    '## What every pass runs',
    '',
    ...prompts.flatMap(({ card, prompt }) => [
      `**${untitled(card.title)}**`,
      '',
      '```',
      prompt,
      '```',
      '',
    ]),
    '---',
    '',
    `An empty list is an answer too: the stage is then skipped and the run goes on past it. A stage takes at most ${MAX_STAGE_ITEMS} items, and a longer list ends the run rather than being cut short - so do not shorten one to fit, and do not pad one either.`,
    'Answer with `{"items": [{"label": "...", "value": "..."}]}`. `value` is written into the prompts exactly as it stands - a link, a path or a name, not a sentence about one. `label` is what the screen calls the item: a few words a person recognises it by.',
  ].join('\n')

/** Что о проходе сказать в заголовке передачи карточки. */
const placeLine = (stage: ScenarioStage, pass: number, passes: number, item: RunItem | null) => {
  if (item?.again)
    return `Stage ${stage.title}, a second go at item ${item.index} of ${item.count}: ${item.label}.`
  if (item) return `Stage ${stage.title}, item ${item.index} of ${item.count}: ${item.label}.`

  return passes > 1 ? `Stage ${stage.title}, pass ${pass} of ${passes}.` : `Stage ${stage.title}.`
}

const freshNote = (pass: number, passes: number, item: RunItem | null): string[] => {
  if (item?.again) {
    return [
      '',
      `You put this item off after its first go, until the rest of the list was done. What you said then: ${item.again}. Its session is told the same in its own briefing, so tell it only what has changed since.`,
    ]
  }

  if ((item && item.index > 1) || (!item && passes > 1 && pass > 1)) {
    return [
      '',
      'This is a fresh session of the same card: the cards of earlier passes have already run, and it remembers nothing of them - tell it what it needs through its slots.',
    ]
  }

  return []
}

/** Передача карточки: что скажут её сессии, что заполнить и как судить. */
export const handoverMessage = (options: {
  stage: ScenarioStage
  card: ScenarioCard
  index: number
  total: number
  pass: number
  passes: number
  prompt: string
  retries: number
  handsOver: boolean
  item: RunItem | null
}): string => {
  const { stage, card, item } = options
  const slots = slotsToFill(stage, card)
  const each = stage.each

  return [
    `# Card ${options.index} of ${options.total} - ${untitled(card.title)}`,
    '',
    placeLine(stage, options.pass, options.passes, item),
    ...freshNote(options.pass, options.passes, item),
    '',
    '## What its session will be told',
    '',
    '```',
    options.prompt,
    '```',
    '',
    ...(item && each
      ? [
          `\`[[${each.name}]]\` is this pass’s item, and the panel has written it in: ${item.value}`,
          '',
        ]
      : []),
    ...(slots.length === 0
      ? ['## Slots', '', 'There are none for you to fill. Answer with an empty object for `slots`.']
      : [
          '## Slots you must fill',
          '',
          'Each appears in the prompt above as `[[name]]` and is replaced by what you give it, exactly as it stands. Give a path, not a sentence about a path.',
          '',
          'Never answer with an empty value. When nothing has happened for a slot yet - a first pass, a stage that found nothing - say that in words, in the language of the card.',
          '',
          ...slots.map(
            (slot) =>
              `- **${slot.name}** - ${slot.description.trim() || '(used in the prompt but never described)'}`,
          ),
        ]),
    '',
    '## Definition of done',
    '',
    card.dod.trim() ||
      '(Nothing written. The turn ending without an error is enough - unless what comes back plainly contradicts the prompt.)',
    ...(card.after.trim() ? ['', '## After the card', '', card.after.trim()] : []),
    '',
    '---',
    '',
    `You will be able to send this card back to work at most ${options.retries} time(s) once it has answered.`,
    ...(options.handsOver
      ? [
          'If it still cannot finish, its work comes to you: you will finish it yourself before the run moves on.',
        ]
      : []),
    'Answer with `{"slots": {}}` - a value for every slot named above, by name.',
  ].join('\n')
}
