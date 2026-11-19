import type { Conversation, ModeAvailability } from '@shared/conversation'
import { modeAvailability } from '@shared/conversation'

import { useProjectClaudeSettings } from './claude-settings.queries'
import { useRefusedModes, usePanelCapabilities } from './panel.queries'

/**
 * Запрещают ли слои настроек проекта режим без вопросов: undefined - ещё не прочли. У
 * провайдера без слоёв (settingsLayers) - не запрещают. asked - читать ли их сейчас (меню
 * режима закрыто - незачем).
 */
export const useBypassDisabled = (
  projectId: string | undefined,
  asked = true,
): boolean | undefined => {
  const { settingsLayers } = usePanelCapabilities()
  const { data: settings } = useProjectClaudeSettings(
    projectId ?? '',
    settingsLayers && asked && projectId !== undefined,
  )

  return settingsLayers ? settings?.bypassDisabled : false
}

/**
 * Какие режимы разговору доступны: запрет bypass из слоёв настроек проекта и отказы CLI,
 * которые помнит главный процесс. Одно правило для Shift+Tab, меню MODE и телефона
 * (`modeAvailability` общий с мостом Remote Control).
 */
export const useModeAvailability = (
  projectId: string | undefined,
  conversation: Conversation | null,
): ModeAvailability =>
  modeAvailability(useRefusedModes(), useBypassDisabled(projectId), conversation)
