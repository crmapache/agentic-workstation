import type { SlashCommand } from '@shared/conversation'

/** Навык Codex (`skills/list`): имя для «/», путь - для элемента ввода `skill`. */
export type CodexSkill = { name: string; path: string; description: string }

/**
 * Что набрано в поле, словами Codex: сжать разговор (`thread/compact/start`), ревью
 * (`review/start`: без слов - незакоммиченные правки, со словами - что смотреть), навык
 * (элемент ввода `skill` и слова после него). null - обычное сообщение.
 */
export type CodexCommand =
  | { kind: 'compact' }
  | { kind: 'review'; instructions: string }
  | { kind: 'skill'; skill: CodexSkill; rest: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

export const commandOf = (input: string, skills: readonly CodexSkill[]): CodexCommand | null => {
  const match = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(input.trim())

  if (!match) return null

  const [, name = '', rest = ''] = match

  if (name === 'compact') return { kind: 'compact' }
  if (name === 'review') return { kind: 'review', instructions: rest.trim() }

  const skill = skills.find((known) => known.name === name)

  return skill ? { kind: 'skill', skill, rest: rest.trim() } : null
}

/** Навыки папки проекта (`skills/list`): включённые, по имени. */
export const skillsFromList = (result: unknown): CodexSkill[] => {
  const entries = isRecord(result) && Array.isArray(result['data']) ? result['data'] : []

  return entries
    .filter(isRecord)
    .flatMap((entry) => (Array.isArray(entry['skills']) ? entry['skills'].filter(isRecord) : []))
    .filter((skill) => skill['enabled'] !== false && text(skill, 'name'))
    .map((skill) => ({
      name: text(skill, 'name'),
      path: text(skill, 'path'),
      description: text(skill, 'shortDescription') || text(skill, 'description'),
    }))
}

/** Навыки - командами «/» проекта: их показывает подсказка поля. */
export const skillCommands = (skills: readonly CodexSkill[]): SlashCommand[] =>
  skills.map((skill) => ({ name: skill.name, description: skill.description, argumentHint: '' }))
