import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { IS_WINDOWS } from '../../platform'

/**
 * Слои настроек Claude Code - те же файлы, что читает CLI, от сильного к слабому:
 * политика организации, локальный файл проекта, общий файл проекта, настройки
 * человека. Первое найденное значение и действует. Файлы репозитория сильнее личных:
 * для разрешений и хуков это верно, а блок `env` из них перебивает вход, сделанный на
 * этой машине (строка SETTINGS в ленте).
 */
export type SettingsLayer = 'policy' | 'local' | 'project' | 'user'

export type LayerFile = { layer: SettingsLayer; file: string }

/** Файл слоя, уже прочитанный: битый или отсутствующий - пустой объект. */
export type LayerSettings = { layer: SettingsLayer; settings: Record<string, unknown> }

/**
 * Политика организации: файл и папка его кусков рядом (CLI читает все). Место - как в
 * документации Claude Code: на маке в /Library, на Windows - в Program Files.
 */
const MANAGED_DIR = IS_WINDOWS
  ? join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'ClaudeCode')
  : '/Library/Application Support/ClaudeCode'
const MANAGED_FILE = 'managed-settings.json'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Локальный и общий файлы настроек репозитория - сильный первым. */
export const repositoryFiles = (projectPath: string): LayerFile[] => [
  { layer: 'local', file: join(projectPath, '.claude', 'settings.local.json') },
  { layer: 'project', file: join(projectPath, '.claude', 'settings.json') },
]

/**
 * Файлы слоёв проекта от сильного к слабому - все, что читает CLI: процесс разговора
 * поднимается без `--setting-sources`, и панель читает ровно то же, иначе назвала бы
 * режим, в котором процесс не поднимется.
 */
export const layerFiles = async (projectPath: string, claudeHome: string): Promise<LayerFile[]> => {
  const piecesDir = join(MANAGED_DIR, `${MANAGED_FILE}.d`)
  const pieces = (await readdir(piecesDir).catch(() => []))
    .filter((name) => name.endsWith('.json'))
    .sort()

  return [
    { layer: 'policy', file: join(MANAGED_DIR, MANAGED_FILE) },
    ...pieces.map((name): LayerFile => ({ layer: 'policy', file: join(piecesDir, name) })),
    ...repositoryFiles(projectPath),
    { layer: 'user', file: join(claudeHome, 'settings.json') },
  ]
}

/** Объект JSON из файла. Нет файла или он битый - пустой: чужой файл не роняет панель. */
export const readSettingsObject = async (file: string): Promise<Record<string, unknown>> => {
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'))

    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

/** Прочитать файлы слоёв, сохранив порядок. */
export const readLayers = async (files: readonly LayerFile[]): Promise<LayerSettings[]> =>
  Promise.all(
    files.map(async ({ layer, file }) => ({ layer, settings: await readSettingsObject(file) })),
  )
