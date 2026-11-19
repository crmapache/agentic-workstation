import type { ParseKeys } from 'i18next'

import type { ToolChip } from '../tool-icons'

/** Подпись чипа вызова. */
export const CHIP_KEYS: Record<ToolChip, ParseKeys> = {
  READ: 'agentPanel.feed.chips.read',
  GREP: 'agentPanel.feed.chips.grep',
  EDIT: 'agentPanel.feed.chips.edit',
  WRITE: 'agentPanel.feed.chips.write',
  BASH: 'agentPanel.feed.chips.bash',
  WEB: 'agentPanel.feed.chips.web',
  MCP: 'agentPanel.feed.chips.mcp',
  SKILL: 'agentPanel.feed.chips.skill',
  TOOL: 'agentPanel.feed.chips.tool',
}
