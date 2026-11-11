import type { ScenarioProblem } from '@shared/scenario-rules'
import type { Scenario, StageEach, ScenarioCard, ScenarioStage } from '@shared/scenarios'

import { isUntouched } from './scenarios-blank.utils'

/**
 * Правка черновика сценария в редакторе (ScenarioEditor в ACC) - чистыми функциями: черновик
 * лежит в сторе вида (окно редактора), и каждое нажатие пишет в него новый сценарий целиком, а
 * не правит старый.
 */

/** Какая часть сценария открыта справа от оглавления. */
export type EditorPlace =
  | { part: 'name' }
  | { part: 'head' }
  | { part: 'inputs' }
  | { part: 'stage'; stageId: string; cardId?: string | undefined }

/**
 * Сохранённый сценарий, с которым сравнивают черновик: та же полка, а если её в черновике
 * сменили - та, где файл лежит сейчас. Нет - сценарий ещё не сохранён.
 */
export const savedTwin = (
  draft: Pick<Scenario, 'id' | 'scope'>,
  shelves: readonly Scenario[],
): Scenario | null => {
  if (!draft.id) return null

  return (
    shelves.find((one) => one.id === draft.id && one.scope === draft.scope) ??
    shelves.find((one) => one.id === draft.id) ??
    null
  )
}

/**
 * Есть ли что терять, закрывая редактор. Сравнение с полкой, а не со снимком при открытии:
 * окно редактора переживает уход с вида, и снимок тогда был бы уже правленым черновиком. Новый
 * сценарий без единого набранного слова терять нечего - спрашивать о нём незачем.
 */
export const isDirty = (draft: Scenario, shelves: readonly Scenario[]): boolean => {
  const saved = savedTwin(draft, shelves)

  if (!saved) return !isUntouched(draft)

  return JSON.stringify(saved) !== JSON.stringify(draft)
}

/** Список, где элемент с места from сдвинут на by мест; сдвиг за край - список как был. */
export const shifted = <T>(list: readonly T[], from: number, by: number): T[] => {
  const to = from + by
  const copy = [...list]

  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return copy

  const [taken] = copy.splice(from, 1)

  if (taken !== undefined) copy.splice(to, 0, taken)

  return copy
}

/** Сценарий, где этап stageId переписан change; остальные этапы - те же объекты. */
export const withStage = (
  draft: Scenario,
  stageId: string,
  change: (stage: ScenarioStage) => ScenarioStage,
): Scenario => ({
  ...draft,
  stages: draft.stages.map((stage) => (stage.id === stageId ? change(stage) : stage)),
})

/** Этап, где карточка cardId переписана change. */
export const withCard = (
  stage: ScenarioStage,
  cardId: string,
  change: (card: ScenarioCard) => ScenarioCard,
): ScenarioStage => ({
  ...stage,
  cards: stage.cards.map((card) => (card.id === cardId ? change(card) : card)),
})

/** Этап сдвинут на by мест вверх (минус) или вниз. */
export const movedStage = (draft: Scenario, stageId: string, by: number): Scenario => ({
  ...draft,
  stages: shifted(
    draft.stages,
    draft.stages.findIndex((stage) => stage.id === stageId),
    by,
  ),
})

/** Карточка сдвинута на by мест внутри своего этапа. */
export const movedCard = (stage: ScenarioStage, cardId: string, by: number): ScenarioStage => ({
  ...stage,
  cards: shifted(
    stage.cards,
    stage.cards.findIndex((card) => card.id === cardId),
    by,
  ),
})

export const withoutStage = (draft: Scenario, stageId: string): Scenario => ({
  ...draft,
  stages: draft.stages.filter((stage) => stage.id !== stageId),
})

export const withoutCard = (stage: ScenarioStage, cardId: string): ScenarioStage => ({
  ...stage,
  cards: stage.cards.filter((card) => card.id !== cardId),
})

/**
 * Копия карточки сразу под ней, со своим id: прогоны ключуют шаги по id карточки, и две
 * карточки с одним id отзывались бы на одну строку таймлайна.
 */
export const withCopiedCard = (
  stage: ScenarioStage,
  cardId: string,
  copyId: string,
): ScenarioStage => ({
  ...stage,
  cards: stage.cards.flatMap((card) =>
    card.id === cardId
      ? [card, { ...card, id: copyId, slots: card.slots.map((slot) => ({ ...slot })) }]
      : [card],
  ),
})

/**
 * RUNS «по пункту списка»: один проход-заглушка, «пока не готово» снято - у такого этапа
 * длину задаёт список, а не голова. Уже заданный список не затирается.
 */
export const runsPerItem = (stage: ScenarioStage, blank: StageEach): ScenarioStage => ({
  ...stage,
  repeat: 1,
  untilDone: false,
  each: stage.each ?? blank,
})

/** RUNS числом: список снимается, галочка «или меньше» остаётся, как её поставили. */
export const runsTimes = (stage: ScenarioStage, repeat: number): ScenarioStage => ({
  ...stage,
  repeat,
  each: null,
})

const INPUT_KINDS: ReadonlySet<ScenarioProblem['kind']> = new Set([
  'badInputName',
  'duplicateInput',
])

/**
 * Куда ведёт находка из списка под оглавлением: к своей карточке (этап держит её), к
 * этапу, к вопросам сценария. «Этапов нет» - к началу: показать там нечего, а «Add a stage»
 * стоит в том же оглавлении.
 */
export const placeOfProblem = (draft: Scenario, problem: ScenarioProblem): EditorPlace => {
  if (INPUT_KINDS.has(problem.kind)) return { part: 'inputs' }

  const stage = draft.stages.find((one) =>
    problem.stageId
      ? one.id === problem.stageId
      : one.cards.some((card) => card.id === problem.cardId),
  )

  return stage ? { part: 'stage', stageId: stage.id, cardId: problem.cardId } : { part: 'name' }
}

/**
 * Место, которому ещё есть что показать. Этап удалили, пока окно его держало, или модель
 * прислала сценарий со своими этапами - место в сторе указывает в никуда, и пустая правая
 * часть читалась бы как сценарий, потерявший этапы. Пропавшая карточка - просто её этап.
 */
export const livePlace = (draft: Scenario, at: EditorPlace): EditorPlace => {
  if (at.part !== 'stage') return at

  const stage = draft.stages.find((one) => one.id === at.stageId)

  if (!stage) return { part: 'name' }

  return at.cardId && !stage.cards.some((card) => card.id === at.cardId)
    ? { part: 'stage', stageId: stage.id }
    : at
}

/**
 * Имена в промпте - те же две формы, что читают правила (`shared/scenario-rules.ts`), с той же
 * терпимостью к пробелам внутри: имя, подсвеченное иначе, чем прочитанное, хуже, чем никакое.
 */
const NAMES = /(\{\{\s*[a-zA-Z0-9_-]+\s*\}\}|\[\[\s*[a-zA-Z0-9_-]+\s*\]\])/

/** Промпт кусками для подсветки: текст как набран, {{вопрос}} и [[слот]] отдельно. */
export const promptPieces = (text: string) =>
  text
    .split(NAMES)
    .map((piece, index) => ({
      text: piece,
      kind:
        index % 2 === 0
          ? ('text' as const)
          : piece.startsWith('{')
            ? ('input' as const)
            : ('slot' as const),
    }))
    .filter((piece) => piece.text.length > 0)
