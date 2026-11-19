import { access } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Указания процессу OpenCode (ADR 0089). Сам OpenCode тянет в каждый запрос настройки Claude Code
 * человека: личный `~/.claude/CLAUDE.md`, его скиллы и скиллы из `~/.agents/skills` - у Макса это
 * две трети запроса (около 17 тысяч токенов из 23). Модели с маленьким окном (локальные) из этого
 * получают только правила проекта: остальное съело бы окно до первого слова.
 */

/** Окно, начиная с которого модель получает всё, что тянет OpenCode; меньше - только проект. */
export const FULL_INSTRUCTIONS_FROM = 128_000

/**
 * Окно, с которым процесс поднимается, - компактное ли. Неизвестное (0) OpenCode получает
 * запасным в 32K (connections.constants.ts) - оно тоже маленькое.
 */
export const isCompactWindow = (tokens: number): boolean => tokens < FULL_INSTRUCTIONS_FROM

/** Что процесс OpenCode получает сверх обычного: переменные окружения и поля конфига. */
export type InstructionsSetup = {
  env: Record<string, string>
  config: Record<string, unknown>
}

const FULL: InstructionsSetup = { env: {}, config: {} }

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

/**
 * Компактный набор для папки, где работает процесс: Claude Code у OpenCode выключен целиком
 * (`OPENCODE_DISABLE_CLAUDE_CODE` - личный CLAUDE.md, скиллы Claude и заодно CLAUDE.md папки), и
 * CLAUDE.md папки возвращается указанием - так, как OpenCode берёт его сам: только без AGENTS.md
 * рядом (с ним CLAUDE.md OpenCode не читает). Прочие скиллы (`~/.agents/skills`, свои OpenCode)
 * закрыты политикой: выключить их источник иначе нельзя.
 */
export const instructionsSetup = async (
  directory: string,
  compact: boolean,
): Promise<InstructionsSetup> => {
  if (!compact) return FULL

  const claudeMd = join(directory, 'CLAUDE.md')
  const ownRules = !(await exists(join(directory, 'AGENTS.md'))) && (await exists(claudeMd))

  return {
    env: { OPENCODE_DISABLE_CLAUDE_CODE: '1' },
    config: {
      ...(ownRules && { instructions: [claudeMd] }),
      policies: [{ action: 'skill.use', resource: '*', effect: 'deny' }],
    },
  }
}
