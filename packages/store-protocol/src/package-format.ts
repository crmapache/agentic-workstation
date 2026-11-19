import { z } from 'zod'

/**
 * Пакет расширения в магазине (ADR 0091): JSON с манифестом и текстовыми файлами папки. Только
 * текст и только знакомые расширения файлов - архива нет, распаковывать нечего, путь не выйдет за
 * папку. Отпечаток (sha256 канонического JSON) хранит сервер и сверяет IDE после скачивания.
 */
export const PACKAGE_FORMAT = 'aw-extension/1'

export const PACKAGE_LIMITS = {
  files: 200,
  /** Все файлы вместе, в знаках. */
  totalChars: 2 * 1024 * 1024,
  pathChars: 200,
  depth: 6,
} as const

/** Права, которые может просить расширение: совпадает с EXTENSION_PERMISSIONS IDE (держит тест). */
export const KNOWN_PERMISSIONS = [
  'files.read',
  'files.write',
  'agent.observe',
  'agent.intercept',
  'ide.control',
  'ai.tools',
  'network',
  'shell',
  'clipboard',
] as const

export type KnownPermission = (typeof KNOWN_PERMISSIONS)[number]

/** Что едет в пакете: код, данные, описание. Руководство для ИИ IDE кладёт сама - его нет. */
const PACKED_EXTENSIONS = ['.js', '.mjs', '.json', '.md', '.txt']

/** Файлы, которые IDE пишет в папку расширения сама и которые в пакет не идут. */
export const GENERATED_FILES = ['AGENTS.md', 'CLAUDE.md', 'ide.d.ts']

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/

/** Путь файла в пакете: через «/», без «..», скрытых файлов и лишней глубины. */
export const isPackagePath = (path: string): boolean => {
  const parts = path.split('/')

  return (
    path.length > 0 &&
    path.length <= PACKAGE_LIMITS.pathChars &&
    parts.length <= PACKAGE_LIMITS.depth &&
    parts.every((part) => SEGMENT.test(part) && part !== '..') &&
    PACKED_EXTENSIONS.some((extension) => path.endsWith(extension)) &&
    !GENERATED_FILES.includes(path)
  )
}

export const EXTENSION_ID = /^[a-z][a-z0-9-]{1,39}$/

export const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Пакет расширения: манифест - как в extension.json, файлы - по путям от корня папки. */
export type ExtensionPackage = {
  format: typeof PACKAGE_FORMAT
  manifest: Record<string, unknown>
  files: Record<string, string>
}

const manifestCore = z
  .object({
    id: z.string().regex(EXTENSION_ID),
    name: z.string().trim().min(1).max(60),
    version: z.string().regex(VERSION),
    description: z.string().max(500).optional(),
    icon: z
      .string()
      .regex(/^[A-Z][A-Za-z0-9]{0,40}$/)
      .optional(),
    main: z.string().optional(),
    apiVersion: z.literal(1),
    permissions: z.array(z.enum(KNOWN_PERMISSIONS)).optional(),
    network: z.object({ hosts: z.array(z.string().max(253)).max(50) }).optional(),
    shell: z.object({ commands: z.array(z.string().max(64)).max(50) }).optional(),
  })
  .loose()

const packageSchema = z.object({
  format: z.literal(PACKAGE_FORMAT),
  manifest: manifestCore,
  files: z.record(z.string(), z.string()),
})

/** Сводка манифеста, которую видит магазин: имя, версия, права и их рамки. */
export type PackageSummary = {
  id: string
  name: string
  version: string
  description: string
  icon: string
  permissions: KnownPermission[]
  hosts: string[]
  commands: string[]
  readme: string
}

export type PackageCheck =
  { ok: true; pkg: ExtensionPackage; summary: PackageSummary } | { ok: false; reason: string }

/**
 * Проверить пакет: формат, манифест, пути и размер. Манифест целиком IDE проверит при установке
 * своим разбором; здесь - то, без чего магазину нечего показать и нечего хранить.
 */
export const checkPackage = (value: unknown): PackageCheck => {
  const parsed = packageSchema.safeParse(value)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]

    return {
      ok: false,
      reason: `package: ${issue?.path.join('.') || 'root'} - ${issue?.message ?? 'invalid'}`,
    }
  }

  const { manifest, files } = parsed.data
  const paths = Object.keys(files)

  if (paths.length > PACKAGE_LIMITS.files) return { ok: false, reason: 'package: too many files' }

  const bad = paths.find((path) => !isPackagePath(path))

  if (bad !== undefined)
    return { ok: false, reason: `package: file "${bad.slice(0, 80)}" is not allowed` }

  const total = Object.values(files).reduce((sum, text) => sum + text.length, 0)

  if (total > PACKAGE_LIMITS.totalChars)
    return { ok: false, reason: 'package: files are larger than 2 MB' }

  const main = manifest.main ?? 'main.js'

  if (!(main in files)) return { ok: false, reason: `package: the entry "${main}" is missing` }

  return {
    ok: true,
    pkg: { format: PACKAGE_FORMAT, manifest: parsed.data.manifest, files },
    summary: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description ?? '',
      icon: manifest.icon ?? 'Puzzle',
      permissions: [...new Set(manifest.permissions ?? [])],
      hosts: [...new Set(manifest.network?.hosts ?? [])],
      commands: [...new Set(manifest.shell?.commands ?? [])],
      readme: files['README.md'] ?? '',
    },
  }
}

/** JSON с ключами по алфавиту на всех уровнях: один пакет - одна строка, один отпечаток. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(',')}}`
  }

  return JSON.stringify(value)
}

/** Сравнить версии x.y.z: меньше нуля - a старше. Хвост после «-» - раньше той же без него. */
export const compareVersions = (a: string, b: string): number => {
  const [coreA = '', preA] = a.split('-', 2)
  const [coreB = '', preB] = b.split('-', 2)
  const partsA = coreA.split('.').map(Number)
  const partsB = coreB.split('.').map(Number)

  for (let index = 0; index < 3; index += 1) {
    const diff = (partsA[index] ?? 0) - (partsB[index] ?? 0)

    if (diff !== 0) return diff
  }

  if (preA === preB) return 0
  if (preA === undefined) return 1
  if (preB === undefined) return -1

  return preA < preB ? -1 : 1
}
