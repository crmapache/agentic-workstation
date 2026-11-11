import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/** Вид вызова в шапке карточки - чип, как в ACC. */
export type ToolChip =
  'READ' | 'GREP' | 'EDIT' | 'WRITE' | 'BASH' | 'WEB' | 'MCP' | 'SKILL' | 'TOOL'

const CHIPS: Record<string, ToolChip> = {
  Read: 'READ',
  NotebookRead: 'READ',
  Grep: 'GREP',
  Glob: 'GREP',
  LS: 'GREP',
  Edit: 'EDIT',
  MultiEdit: 'EDIT',
  NotebookEdit: 'EDIT',
  Write: 'WRITE',
  Bash: 'BASH',
  BashOutput: 'BASH',
  KillShell: 'BASH',
  WebFetch: 'WEB',
  WebSearch: 'WEB',
  Skill: 'SKILL',
}

/**
 * Тон чипа - смыслом (ADR 0006): чтение и поиск ничего не меняют - нейтральные; правка -
 * главное в ходе (акцент); команда - то, за чем стоит приглядеть (жёлтый); сеть,
 * MCP и скиллы - справка со стороны (мятный).
 */
const TONES: Record<ToolChip, BadgeTone> = {
  READ: 'neutral',
  GREP: 'neutral',
  TOOL: 'neutral',
  EDIT: 'accent',
  WRITE: 'accent',
  BASH: 'warning',
  WEB: 'info',
  MCP: 'info',
  SKILL: 'info',
}

/** Чип вызова в ленте: MCP - по префиксу, незнакомый инструмент - TOOL. */
export const toolChip = (name: string): ToolChip =>
  name.startsWith('mcp__') ? 'MCP' : (CHIPS[name] ?? 'TOOL')

/** Тон чипа вызова. */
export const chipTone = (chip: ToolChip): BadgeTone => TONES[chip]
