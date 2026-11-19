import type { PermissionMode } from '@shared/conversation'
import { PERMISSION_MODES } from '@shared/conversation'

import type { LayerSettings, SettingsLayer } from './setting-layers'
import { isRecord, layerFiles, readLayers } from './setting-layers'

/** Откуда настройка: от организации, от человека или из папки проекта (репозитория). */
export type SettingsSource = 'managed' | 'user' | 'project'

/** Что из файла настроек нужно для режима по умолчанию. */
export type ModeSettings = {
  source: SettingsSource
  defaultMode: unknown
  /** `permissions.disableBypassPermissionsMode: "disable"` - режим без вопросов запрещён. */
  bypassDisabled: boolean
}

/** Режимы, которые может предложить сам репозиторий: ни один не снимает вопросы. */
const PROJECT_SAFE_MODES = new Set<PermissionMode>(['default', 'acceptEdits', 'plan'])

/** Режим из настроек CLI - в режим панели. manual - то же, что «спрашивать». */
export const toPanelMode = (value: unknown): PermissionMode | null => {
  if (value === 'manual') return 'default'

  return PERMISSION_MODES.find((mode) => mode === value) ?? null
}

/** Можно ли взять этот режим из файла этого источника - правила самого CLI. */
const isAllowedFrom = (mode: PermissionMode, source: SettingsSource) => {
  if (source === 'project') return PROJECT_SAFE_MODES.has(mode)
  if (mode === 'bypassPermissions') return source === 'user'

  return true
}

/**
 * Режим нового разговора по настройкам, от главных к младшим. Файлы проекта лежат в
 * репозитории, и писать в них может кто угодно, а режим уходит в CLI флагом запуска,
 * которому CLI доверяет. Поэтому из проекта берутся только режимы со спросом
 * (default, acceptEdits, plan), auto - только от организации или человека, а
 * bypassPermissions - только из личных настроек и если его не запретил ни один файл.
 */
export const pickDefaultMode = (settings: readonly ModeSettings[]): PermissionMode => {
  const bypassDisabled = settings.some((item) => item.bypassDisabled)

  for (const item of settings) {
    const mode = toPanelMode(item.defaultMode)

    if (!mode || !isAllowedFrom(mode, item.source)) continue
    if (mode === 'bypassPermissions' && bypassDisabled) continue

    return mode
  }

  return 'default'
}

/** Чей это слой для правил режима: репозиторий - оба его файла. */
const SOURCE_OF: Record<SettingsLayer, SettingsSource> = {
  policy: 'managed',
  local: 'project',
  project: 'project',
  user: 'user',
}

const modeSettingsOf = ({ layer, settings }: LayerSettings): ModeSettings | null => {
  const permissions = settings['permissions']

  if (!isRecord(permissions)) return null

  return {
    source: SOURCE_OF[layer],
    defaultMode: permissions['defaultMode'],
    bypassDisabled: permissions['disableBypassPermissionsMode'] === 'disable',
  }
}

/**
 * Настройки режима из слоёв, которые проект читает, - от главных к младшим. Нет файла,
 * битый файл, нет блока permissions - слоя просто нет.
 */
const readModeSettings = async (projectPath: string, claudeHome: string): Promise<ModeSettings[]> =>
  (await readLayers(await layerFiles(projectPath, claudeHome)))
    .map(modeSettingsOf)
    .filter((item): item is ModeSettings => item !== null)

/** Режим разрешений для нового разговора - тот, что человек выбрал в настройках CLI. */
export const defaultPermissionMode = async (
  projectPath: string,
  claudeHome: string,
): Promise<PermissionMode> => pickDefaultMode(await readModeSettings(projectPath, claudeHome))

/** Запретил ли режим без вопросов хоть один слой, который проект читает. */
export const isBypassDisabled = async (projectPath: string, claudeHome: string): Promise<boolean> =>
  (await readModeSettings(projectPath, claudeHome)).some((item) => item.bypassDisabled)

/**
 * Режим, закреплённый для новых вкладок (Settings → New chats), - если проект его
 * допускает: bypass под запретом CLI не принял бы, вкладка берёт режим по настройкам.
 */
export const allowedPinnedMode = (
  mode: PermissionMode | null,
  bypassDisabled: boolean,
): PermissionMode | null => (mode === 'bypassPermissions' && bypassDisabled ? null : mode)
