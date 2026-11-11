import { passesOf } from '@shared/scenario-rules'
import type {
  CardSlot,
  OnGiveUp,
  Scenario,
  StageEach,
  OnQuestion,
  HeadSettings,
  ScenarioCard,
  ScenarioInput,
  ScenarioScope,
  ScenarioStage,
} from '@shared/scenarios'
import { MAX_CARD_RETRIES, SCENARIO_VERSION } from '@shared/scenarios'

/**
 * Сценарий из чужих рук - файла на диске (его правят руками и приносит git) или окна - в
 * форму, которой можно верить: у каждого поля значение по умолчанию, числа зажаты, полка
 * берётся из того, где файл лежит, а не из него самого.
 */

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (raw: Raw, key: string): string => (typeof raw[key] === 'string' ? raw[key] : '')

const number = (raw: Raw, key: string, fallback: number): number => {
  const value = raw[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const list = (raw: Raw, key: string): Raw[] => {
  const value = raw[key]

  return Array.isArray(value) ? value.filter(isRaw) : []
}

/** Полка словом файла или запроса; всё незнакомое - проектная (как ScenarioScope.normalize). */
export const scopeOf = (value: unknown): ScenarioScope => (value === 'user' ? 'user' : 'project')

const inputOf = (raw: Raw): ScenarioInput => ({
  id: text(raw, 'id'),
  name: text(raw, 'name'),
  label: text(raw, 'label'),
  placeholder: text(raw, 'placeholder'),
  required: raw['required'] === true,
})

const slotOf = (raw: Raw): CardSlot => ({
  id: text(raw, 'id'),
  name: text(raw, 'name'),
  description: text(raw, 'description'),
})

const cardOf = (raw: Raw): ScenarioCard => ({
  id: text(raw, 'id'),
  title: text(raw, 'title'),
  prompt: text(raw, 'prompt'),
  slots: list(raw, 'slots').map(slotOf),
  dod: text(raw, 'dod'),
  after: text(raw, 'after'),
  model: text(raw, 'model'),
  effort: text(raw, 'effort'),
  permissionMode: text(raw, 'permissionMode'),
})

const eachOf = (value: unknown): StageEach | null =>
  isRaw(value) ? { name: text(value, 'name'), description: text(value, 'description') } : null

const stageOf = (raw: Raw): ScenarioStage => {
  const stage: ScenarioStage = {
    id: text(raw, 'id'),
    title: text(raw, 'title'),
    repeat: number(raw, 'repeat', 1),
    untilDone: raw['untilDone'] === true,
    each: eachOf(raw['each']),
    cards: list(raw, 'cards').map(cardOf),
  }

  return { ...stage, repeat: passesOf(stage) }
}

const headOf = (value: unknown): HeadSettings => {
  const raw = isRaw(value) ? value : {}
  const onQuestion: OnQuestion = raw['onQuestion'] === 'stop' ? 'stop' : 'head'
  const onGiveUp: OnGiveUp = raw['onGiveUp'] === 'head' ? 'head' : 'stop'

  return {
    briefing: text(raw, 'briefing'),
    model: text(raw, 'model'),
    effort: text(raw, 'effort'),
    permissionMode: text(raw, 'permissionMode') || 'default',
    onQuestion,
    retries: Math.min(MAX_CARD_RETRIES, Math.max(0, Math.round(number(raw, 'retries', 2)))),
    onGiveUp,
  }
}

/** Сценарий из разобранного JSON; не объект - null. */
export const parseScenario = (value: unknown, scope: ScenarioScope): Scenario | null => {
  if (!isRaw(value)) return null

  return {
    version: number(value, 'version', SCENARIO_VERSION),
    id: text(value, 'id'),
    name: text(value, 'name'),
    createdAt: number(value, 'createdAt', 0),
    updatedAt: number(value, 'updatedAt', 0),
    inputs: list(value, 'inputs').map(inputOf),
    head: headOf(value['head']),
    stages: list(value, 'stages').map(stageOf),
    scope,
  }
}

/** Файл сценария: без полки - она там, где лежит файл. */
export const scenarioFile = (scenario: Scenario): string => {
  const { scope: _scope, ...stored } = scenario

  return `${JSON.stringify(stored, null, 2)}\n`
}

/** Свой id для сценария, этапа, карточки: буквы и цифры, имя файла. */
export const freshId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 16)

/** Годится ли id в имя файла: буквы, цифры, дефис и подчёркивание, не длиннее 64. */
export const isUsableId = (id: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(id)
