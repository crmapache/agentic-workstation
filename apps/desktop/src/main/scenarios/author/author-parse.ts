import { SCENARIO_NAME, mentionedSlots } from '@shared/scenario-rules'
import type {
  CardSlot,
  Scenario,
  StageEach,
  ScenarioCard,
  ScenarioInput,
  ScenarioScope,
  ScenarioStage,
} from '@shared/scenarios'
import { MAX_CARD_RETRIES, MAX_STAGE_REPEAT, SCENARIO_VERSION } from '@shared/scenarios'

import { freshId } from '../store/scenario-parse'

/**
 * Ответ модели-автора - в сценарий (scenarioOf в ACC). Ответу не верят ни в чём: числа
 * зажаты, режимы - из списка, имена - по правилу, id - свои. Модель и усилие - всегда пустые:
 * незнакомое имя модели CLI примет на запуске и умрёт на первом сообщении.
 */

const MAX_STAGES = 8
const MAX_CARDS = 10
const MAX_INPUTS = 8
const MAX_SLOTS = 8
const MAX_NAME_CHARS = 80
const MAX_TEXT_CHARS = 4000
const MODES = new Set(['default', 'manual', 'acceptEdits', 'plan', 'bypassPermissions'])

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const string = (raw: Raw, name: string): string | null =>
  typeof raw[name] === 'string' ? raw[name] : null

const text = (raw: Raw, name: string): string =>
  (string(raw, name) ?? '').trim().slice(0, MAX_TEXT_CHARS)

const title = (raw: Raw, name: string): string =>
  (string(raw, name) ?? '').trim().slice(0, MAX_NAME_CHARS)

const number = (raw: Raw, name: string): number | null => {
  const value = raw[name]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN

  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

const flag = (raw: Raw, name: string): boolean => raw[name] === true || raw[name] === 'true'

const list = (raw: Raw, name: string): Raw[] =>
  Array.isArray(raw[name]) ? (raw[name] as unknown[]).filter(isRaw) : []

const usableName = (raw: string | null): string | null => {
  const name = raw?.trim() ?? ''

  return name && name.length <= MAX_NAME_CHARS && SCENARIO_NAME.test(name) ? name : null
}

/**
 * `[[task]]`, написанное для ввода `task`, - это `{{task}}`: у ошибки одно значение, а
 * оставленная, она читалась бы необъявленным слотом и не давала запустить.
 */
export const withInputBrackets = (
  prompt: string,
  inputs: ReadonlySet<string>,
  slots: ReadonlySet<string>,
): string =>
  mentionedSlots(prompt)
    .filter((name) => inputs.has(name) && !slots.has(name))
    .reduce(
      (text, name) =>
        text.replace(
          new RegExp(`\\[\\[\\s*${name.replace(/[-]/g, '\\-')}\\s*\\]\\]`, 'g'),
          `{{${name}}}`,
        ),
      prompt,
    )

const slotOf = (raw: Raw): CardSlot | null => {
  const name = usableName(string(raw, 'name'))

  return name ? { id: freshId(), name, description: text(raw, 'description') } : null
}

const cardOf = (
  raw: Raw,
  inputs: ReadonlySet<string>,
  item: string | null,
): ScenarioCard | null => {
  const prompt = text(raw, 'prompt')

  if (!prompt) return null

  const slots = list(raw, 'slots')
    .slice(0, MAX_SLOTS)
    .flatMap((one) => slotOf(one) ?? [])
    .filter((slot) => slot.name !== item)
  const names = new Set([...slots.map((slot) => slot.name), ...(item ? [item] : [])])
  const mode = string(raw, 'permissionMode')

  return {
    id: freshId(),
    title: title(raw, 'title'),
    prompt: withInputBrackets(prompt, inputs, names),
    slots,
    dod: text(raw, 'dod'),
    after: text(raw, 'after'),
    model: '',
    effort: '',
    permissionMode: mode && MODES.has(mode) ? mode : '',
  }
}

const eachOf = (value: unknown): StageEach | null => {
  if (!isRaw(value)) return null

  const name = usableName(string(value, 'name'))

  return name ? { name, description: text(value, 'description') } : null
}

const stageOf = (raw: Raw, inputs: ReadonlySet<string>): ScenarioStage | null => {
  const each = eachOf(raw['each'])
  const cards = list(raw, 'cards')
    .slice(0, MAX_CARDS)
    .flatMap((one) => cardOf(one, inputs, each?.name ?? null) ?? [])

  if (cards.length === 0) return null

  return {
    id: freshId(),
    title: title(raw, 'title'),
    repeat: each ? 1 : Math.min(MAX_STAGE_REPEAT, Math.max(1, number(raw, 'repeat') ?? 1)),
    untilDone: !each && flag(raw, 'untilDone'),
    each,
    cards,
  }
}

const inputOf = (raw: Raw): ScenarioInput | null => {
  const name = usableName(string(raw, 'name'))

  return name
    ? {
        id: freshId(),
        name,
        label: title(raw, 'label'),
        placeholder: title(raw, 'placeholder'),
        required: flag(raw, 'required'),
      }
    : null
}

/** Объект ответа - в сценарий на полку scope; не сценарий - null. */
export const scenarioOf = (answer: Raw, scope: ScenarioScope): Scenario | null => {
  const inputs = list(answer, 'inputs')
    .slice(0, MAX_INPUTS)
    .flatMap((one) => inputOf(one) ?? [])
  const names = new Set(inputs.map((input) => input.name))
  const stages = list(answer, 'stages')
    .slice(0, MAX_STAGES)
    .flatMap((one) => stageOf(one, names) ?? [])

  if (stages.length === 0) return null

  const mode = string(answer, 'permissionMode')

  return {
    version: SCENARIO_VERSION,
    id: '',
    name: title(answer, 'name'),
    createdAt: 0,
    updatedAt: 0,
    inputs,
    head: {
      briefing: text(answer, 'briefing'),
      model: '',
      effort: '',
      permissionMode: mode && MODES.has(mode) ? mode : 'default',
      onQuestion: string(answer, 'onQuestion') === 'stop' ? 'stop' : 'head',
      retries: Math.min(MAX_CARD_RETRIES, Math.max(0, number(answer, 'retries') ?? 2)),
      onGiveUp: string(answer, 'onGiveUp') === 'head' ? 'head' : 'stop',
    },
    stages,
    scope,
  }
}

const objectIn = (text: string): Raw | null => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start < 0 || end <= start) return null

  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown

    return isRaw(value) ? value : null
  } catch {
    return null
  }
}

/** Итог `--output-format json` или текст; ответ CLI с ошибкой - её словами. */
export const readAuthorOutput = (
  output: string,
  scope: ScenarioScope,
): { scenario: Scenario } | { error: string } => {
  const lines = output.split('\n').filter((line) => line.trim().startsWith('{'))
  const envelope = [output.trim(), ...lines.reverse()]
    .map((line) => {
      try {
        const value = JSON.parse(line) as unknown

        return isRaw(value) && value['type'] === 'result' ? value : null
      } catch {
        return null
      }
    })
    .find((value) => value !== null)

  if (envelope?.['is_error'] === true) return { error: string(envelope, 'result') ?? '' }

  const body = envelope ? objectIn(string(envelope, 'result') ?? '') : objectIn(output)
  const scenario = body ? scenarioOf(body, scope) : null

  return scenario ? { scenario } : { error: '' }
}

/** Пол модели автора - Sonnet на xhigh: на Haiku low единственный ввод пришёл в скобках слота. */
export const atTheFloor = (model: string, effort: string): { model: string; effort: string } => ({
  model: /haiku/i.test(model) ? 'sonnet' : model,
  effort: ['xhigh', 'max', 'ultracode'].includes(effort) ? effort : 'xhigh',
})
