import type { ToolAction, ToolActionKind } from '@shared/claude-feed'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/** Вид вызова в шапке карточки - чип, как в ACC. */
export type ToolChip =
  'READ' | 'GREP' | 'EDIT' | 'WRITE' | 'BASH' | 'WEB' | 'MCP' | 'SKILL' | 'TOOL'

/** Чип по виду действия; субагент, план, вопрос и незнакомое - TOOL. */
const CHIPS: Partial<Record<ToolActionKind, ToolChip>> = {
  read: 'READ',
  search: 'GREP',
  edit: 'EDIT',
  write: 'WRITE',
  command: 'BASH',
  web: 'WEB',
  mcp: 'MCP',
  skill: 'SKILL',
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

/** Чип вызова в ленте - по виду действия, а не по имени инструмента провайдера. */
export const toolChip = (action: ToolAction): ToolChip => CHIPS[action.kind] ?? 'TOOL'

/** Тон чипа вызова. */
export const chipTone = (chip: ToolChip): BadgeTone => TONES[chip]
