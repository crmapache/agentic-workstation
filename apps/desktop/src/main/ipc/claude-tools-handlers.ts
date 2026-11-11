import { PLUGIN_SCOPES } from '@shared/claude-tools'

import type { ClaudeService } from '../claude/claude-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertOneOf, assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

type ToolsChannels = Extract<keyof InvokeHandlers, `plugins:${string}`>

/**
 * Имя плагина или маркетплейса уходит аргументом CLI: только безопасные
 * символы и не с дефиса - иначе окно подсунуло бы CLI флаг вместо имени.
 */
const NAME_PATTERN = /^[\w.@:/-]{1,200}$/

const assertName = (value: unknown, field: string): string => {
  assertString(value, field)

  if (!NAME_PATTERN.test(value) || value.startsWith('-')) {
    throw new Error(`Недопустимое имя в поле ${field}`)
  }

  return value
}

/**
 * Источник маркетплейса: адрес, путь или owner/repo. Проверяется уже обрезанным - иначе
 * « --scope» прошёл бы проверку и доехал до CLI флагом. Без переводов строк и нулевого
 * байта: аргументы запуска CLI их не переносят.
 */
const assertSource = (value: unknown): string => {
  assertString(value, 'source')

  const source = value.trim()

  if (!source || source.length > 500 || source.startsWith('-') || /[\0\r\n]/.test(source)) {
    throw new Error('Недопустимый источник маркетплейса')
  }

  return source
}

/** Каналы плагинов: проверить вход, позвать PluginTools. */
export const createClaudeToolsHandlers = (
  workspace: WorkspaceService,
  claude: ClaudeService,
): Pick<InvokeHandlers, ToolsChannels> => {
  const root = (projectId: unknown) => projectRootOf(workspace, projectId)
  const { plugins } = claude

  return {
    'plugins:catalog': ({ projectId }) => plugins.catalog(root(projectId)),
    'plugins:act': ({ projectId, action, pluginId, scope, consent }) =>
      plugins.act(
        root(projectId),
        assertOneOf(action, ['install', 'uninstall', 'enable', 'disable', 'update'], 'action'),
        assertName(pluginId, 'pluginId'),
        scope === '' ? '' : assertOneOf(scope, PLUGIN_SCOPES, 'scope'),
        consent === true,
      ),
    'plugins:addMarketplace': ({ projectId, source }) =>
      plugins.addMarketplace(root(projectId), assertSource(source)),
    'plugins:removeMarketplace': ({ projectId, name }) =>
      plugins.removeMarketplace(root(projectId), assertName(name, 'name')),
  }
}
