import type { Conversation, ModeAvailability } from '@shared/claude'
import { modeAvailability } from '@shared/claude'

import { useProjectClaudeSettings } from './claude-settings.queries'
import { useRefusedModes } from './claude.queries'

/**
 * Какие режимы разговору доступны: запрет bypass из слоёв настроек проекта и отказы CLI,
 * которые помнит главный процесс. Одно правило для Shift+Tab, меню MODE и телефона
 * (`modeAvailability` общий с мостом Remote Control).
 */
export const useModeAvailability = (
  projectId: string | undefined,
  conversation: Conversation | null,
): ModeAvailability => {
  const { data: settings } = useProjectClaudeSettings(projectId ?? '', projectId !== undefined)
  const refused = useRefusedModes()

  return modeAvailability(refused, settings?.bypassDisabled, conversation)
}
