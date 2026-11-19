import type { TFunction } from 'i18next'

import { baseName } from '../panel.utils'
import { toolLabel } from '../tool-summary.utils'
import type { PermissionRequest } from './PermissionPrompt.types'

/** Имя вызова вопроса для людей - как у вызова в ленте. */
export const requestLabel = (request: PermissionRequest): string =>
  toolLabel({ name: request.toolName, action: request.action })

/** Что модель хочет сделать - человеческой фразой: «хочет запустить команду». */
export const permissionTitle = (request: PermissionRequest, t: TFunction): string => {
  const { action } = request

  switch (action.kind) {
    case 'command':
      // Без текста команды - служебный вызов вокруг фоновой команды: он не «запускает».
      return action.command
        ? t('agentPanel.permission.run')
        : t('agentPanel.permission.use', { tool: requestLabel(request) })
    case 'edit':
      return t('agentPanel.permission.edit', { file: baseName(action.path) })
    case 'write':
      return t('agentPanel.permission.write', { file: baseName(action.path) })
    case 'web':
      return t('agentPanel.permission.fetch', { target: action.target })
    default:
      return t('agentPanel.permission.use', { tool: requestLabel(request) })
  }
}
