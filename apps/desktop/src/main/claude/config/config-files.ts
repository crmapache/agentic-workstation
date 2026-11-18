import { homedir } from 'node:os'
import { join } from 'node:path'

import { claudeHome } from '../history/transcript-paths'
import { layerFiles, readLayers, readSettingsObject } from '../settings/setting-layers'
import { loginShellEnv } from '../../process/shell-env'
import type { ConfigFiles } from './claude-config'
import { checkpointsOn } from './claude-config'

/**
 * `.claude.json` - старый глобальный конфиг CLI: сосед `~/.claude`, а при
 * CLAUDE_CONFIG_DIR - внутри неё (проверено на 2.1.293).
 */
const globalConfigFile = async () => {
  const env = await loginShellEnv()
  const configDir = env['CLAUDE_CONFIG_DIR']

  return configDir
    ? join(configDir, '.claude.json')
    : join(env['HOME'] || homedir(), '.claude.json')
}

/** Файлы настроек Claude Code - все слои, что проект читает. */
export const readConfigFiles = async (projectPath: string): Promise<ConfigFiles> => {
  const files = await layerFiles(projectPath, await claudeHome())
  const [layers, globalConfig] = await Promise.all([
    readLayers(files),
    readSettingsObject(await globalConfigFile()),
  ])

  return { layers, globalConfig }
}

/**
 * Включены ли копии файлов для процессов проекта. Не прочиталось - включены: так CLI и
 * считает без записи, а лишняя переменная безвредна.
 */
export const fileCheckpointing = (projectPath: string): Promise<boolean> =>
  readConfigFiles(projectPath)
    .then(checkpointsOn)
    .catch(() => true)
