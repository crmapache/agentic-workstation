import type { CardSlot, Scenario, ScenarioCard, ScenarioStage } from './scenarios'
import { MAX_STAGE_REPEAT } from './scenarios'

/**
 * Что значит сценарий - арифметикой: какие имена в тексте, что куда вписывается и что с ним
 * не так. В ACC написано дважды (Kotlin и окно); здесь - одна копия на оба процесса:
 * редактор говорит о беде на каждое нажатие, а главный процесс отказывает в запуске до того,
 * как поднят хоть один процесс.
 */

const INPUT_PATTERN = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g
const SLOT_PATTERN = /\[\[\s*([a-zA-Z0-9_-]+)\s*\]\]/g

/** Каким может быть имя ввода, слота или пункта - ответы модели держатся этого же. */
export const SCENARIO_NAME = /^[a-zA-Z0-9_-]+$/

const names = (text: string, pattern: RegExp): string[] => [
  ...new Set([...text.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : []))),
]

/** `{{name}}` текста по порядку, без повторов. */
export const mentionedInputs = (text: string): string[] => names(text, INPUT_PATTERN)

/** `[[name]]` текста - слоты, которые голова заполнит перед стартом. */
export const mentionedSlots = (text: string): string[] => names(text, SLOT_PATTERN)

/** Ответы человека в текст. Незнакомое имя остаётся как есть: видимая ошибка лучше тихой. */
export const fillInputs = (text: string, values: Readonly<Record<string, string>>): string =>
  text.replace(INPUT_PATTERN, (whole, name: string) => values[name] ?? whole)

/** Слоты, заполненные головой, в текст. */
export const fillSlots = (text: string, values: Readonly<Record<string, string>>): string =>
  text.replace(SLOT_PATTERN, (whole, name: string) => values[name] ?? whole)

/**
 * Слоты карточки на самом деле: объявленные плюс `[[name]]` промпта без объявления - иначе
 * карточке ушёл бы буквальный `[[findings]]`, который никто не заполнил.
 */
export const declaredSlots = (card: ScenarioCard): CardSlot[] => {
  const declared = card.slots.filter((slot) => slot.name.trim().length > 0)
  const known = new Set(declared.map((slot) => slot.name))
  const stray = mentionedSlots(card.prompt)
    .filter((name) => !known.has(name))
    .map((name) => ({ id: name, name, description: '' }))

  return [...declared, ...stray]
}

/** Слоты, о которых спрашивают голову: все, кроме пункта этапа «по пункту» - его вписывает IDE. */
export const slotsToFill = (stage: ScenarioStage, card: ScenarioCard): CardSlot[] =>
  declaredSlots(card).filter((slot) => slot.name !== stage.each?.name)

/** Сколько проходов у этапа - зажато: файлу на диске не верят. */
export const passesOf = (stage: ScenarioStage): number =>
  Math.min(MAX_STAGE_REPEAT, Math.max(1, Math.floor(stage.repeat || 1)))

/** Решает ли голова, когда этап перестаёт ходить по кругу; у этапа «по пункту» - никогда. */
export const loopsUntilDone = (stage: ScenarioStage): boolean => stage.untilDone && !stage.each

/** Проходов на старте: счёт, а у этапа «по пункту» - один, место, где спросят список. */
const plannedPasses = (stage: ScenarioStage): number => (stage.each ? 1 : passesOf(stage))

/** Сколько карточек начнёт прогон, все проходы посчитаны (список - одним проходом). */
export const cardRuns = (scenario: Scenario): number =>
  scenario.stages.reduce((sum, stage) => sum + stage.cards.length * plannedPasses(stage), 0)

/** Ключ слов головы о списке этапа: они про весь этап, а не про первый пункт. */
export const listKey = (stageId: string): string => `${stageId}:list`

/** Имя одного захода одной карточки: этап, карточка, проход. */
export const stepKeyOf = (stageId: string, cardId: string, pass: number): string =>
  `${stageId}:${cardId}:${pass}`

export type ProblemKind =
  | 'noStages'
  | 'emptyStage'
  | 'noPrompt'
  | 'unknownInput'
  | 'undeclaredSlot'
  | 'unusedSlot'
  | 'duplicateInput'
  | 'duplicateSlot'
  | 'badInputName'
  | 'badSlotName'
  | 'badItemName'
  | 'noItemList'
  | 'itemSlotClash'
  | 'unusedItem'

export type ScenarioProblem = {
  kind: ProblemKind
  stageId?: string
  cardId?: string
  name?: string
}

const inputProblems = (scenario: Scenario): ScenarioProblem[] => {
  const seen = new Set<string>()

  return scenario.inputs.flatMap((input): ScenarioProblem[] => {
    if (!SCENARIO_NAME.test(input.name)) return [{ kind: 'badInputName', name: input.name }]
    if (seen.has(input.name)) return [{ kind: 'duplicateInput', name: input.name }]

    seen.add(input.name)

    return []
  })
}

const cardProblems = (
  card: ScenarioCard,
  inputs: ReadonlySet<string>,
  item: string | null,
): ScenarioProblem[] => {
  const problems: ScenarioProblem[] = []
  const slotNames = new Set<string>()
  const cardId = card.id

  if (!card.prompt.trim()) problems.push({ kind: 'noPrompt', cardId })

  for (const slot of card.slots) {
    if (!SCENARIO_NAME.test(slot.name))
      problems.push({ kind: 'badSlotName', cardId, name: slot.name })
    else if (slotNames.has(slot.name))
      problems.push({ kind: 'duplicateSlot', cardId, name: slot.name })
    else if (slot.name === item) problems.push({ kind: 'itemSlotClash', cardId, name: slot.name })

    slotNames.add(slot.name)
  }

  for (const name of mentionedInputs(card.prompt)) {
    if (!inputs.has(name)) problems.push({ kind: 'unknownInput', cardId, name })
  }

  const used = new Set(mentionedSlots(card.prompt))

  for (const name of used) {
    if (!slotNames.has(name) && name !== item)
      problems.push({ kind: 'undeclaredSlot', cardId, name })
  }

  for (const slot of card.slots) {
    if (slot.name.trim() && !used.has(slot.name)) {
      problems.push({ kind: 'unusedSlot', cardId, name: slot.name })
    }
  }

  return problems
}

const stageProblems = (stage: ScenarioStage, inputs: ReadonlySet<string>): ScenarioProblem[] => {
  const problems: ScenarioProblem[] = []
  const stageId = stage.id
  const { each } = stage
  const item = each && SCENARIO_NAME.test(each.name) ? each.name : null

  if (stage.cards.length === 0) problems.push({ kind: 'emptyStage', stageId })

  if (each) {
    if (!item) problems.push({ kind: 'badItemName', stageId, name: each.name })
    if (!each.description.trim()) problems.push({ kind: 'noItemList', stageId })
    if (item && !stage.cards.some((card) => mentionedSlots(card.prompt).includes(item))) {
      problems.push({ kind: 'unusedItem', stageId, name: item })
    }
  }

  return [...problems, ...stage.cards.flatMap((card) => cardProblems(card, inputs, item))]
}

/** Что с ним не так - именами, у которых есть слова в окне. */
export const problemsOf = (scenario: Scenario): ScenarioProblem[] => {
  const inputs = new Set(scenario.inputs.map((input) => input.name))

  return [
    ...inputProblems(scenario),
    ...(scenario.stages.length === 0 ? [{ kind: 'noStages' as const }] : []),
    ...scenario.stages.flatMap((stage) => stageProblems(stage, inputs)),
  ]
}

/**
 * Что мешает запуску, а что только стоит сказать: объявленный и неиспользованный слот -
 * неаккуратность, а использованный и необъявленный - карточка с `[[findings]]` в промпте.
 */
export const isBlocking = (problem: ScenarioProblem): boolean =>
  problem.kind !== 'unusedSlot' && problem.kind !== 'unusedItem'

export const isRunnable = (scenario: Scenario): boolean => !problemsOf(scenario).some(isBlocking)

/** Обязательные вопросы, оставленные пустыми. */
export const missingInputs = (
  scenario: Scenario,
  values: Readonly<Record<string, string>>,
): string[] =>
  scenario.inputs
    .filter((input) => input.required && input.name.trim() && !(values[input.name] ?? '').trim())
    .map((input) => input.name)

/**
 * Ответы, с которыми идёт прогон: каждое объявленное имя, даже нетронутое (иначе оно
 * доехало бы до агента буквальным `{{notes}}`), в порядке вопросов сценария, прочее - после.
 */
export const answersOf = (
  scenario: Scenario,
  values: Readonly<Record<string, string>>,
): Record<string, string> => {
  const declared = scenario.inputs.map((input) => input.name).filter((name) => name.trim())
  const answers: Record<string, string> = {}

  for (const name of declared) answers[name] = values[name] ?? ''

  for (const [name, value] of Object.entries(values)) {
    if (!declared.includes(name)) answers[name] = value
  }

  return answers
}

/** Один задуманный заход карточки - строка плана до старта. */
export type PlannedStep = {
  key: string
  stageId: string
  cardId: string
  pass: number
  title: string
}

/**
 * Весь путь до старта: каждая карточка каждого прохода, в порядке хода. Таймлайн с первой
 * секунды - таймлайн, а не список, растущий по строке.
 */
export const planOf = (scenario: Scenario): PlannedStep[] =>
  scenario.stages.flatMap((stage) =>
    Array.from({ length: plannedPasses(stage) }, (_, index) => index + 1).flatMap((pass) =>
      stage.cards.map((card) => ({
        key: stepKeyOf(stage.id, card.id, pass),
        stageId: stage.id,
        cardId: card.id,
        pass,
        title: card.title.trim() || 'Untitled',
      })),
    ),
  )

const LINK = /^https?:\/\/\S+$/i

/** Сегмент пути ссылки словами: ссылки начинаются одинаково, различает их хвост. */
const linkName = (line: string): string => {
  if (!LINK.test(line)) return line

  try {
    const url = new URL(line)
    const parts = url.pathname.split('/').filter(Boolean).map(decodedPart)
    const last = parts.at(-1)

    if (!last) return url.hostname.replace(/^www\./, '')

    return /^\d+$/.test(last) && parts.length > 1 ? `${parts.at(-2) ?? ''}/${last}` : last
  } catch {
    return line
  }
}

const decodedPart = (part: string): string => {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

/** Метка прогона из ответа: первая строка первого непустого ответа, у ссылки - её хвост. */
export const answerLabel = (inputs: Readonly<Record<string, string>>, chars = 40): string => {
  const answer = Object.values(inputs).find((value) => value.trim().length > 0) ?? ''

  return linkName(answer.split('\n')[0]?.trim() ?? '').slice(0, chars)
}
