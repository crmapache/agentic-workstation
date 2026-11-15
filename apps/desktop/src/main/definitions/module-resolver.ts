import { posix } from 'node:path'

import ts from 'typescript'

import { scriptKindOf } from './script-files'

/** Настройки без tsconfig: как у сборщика (Vite, Next) - пакеты из node_modules, без расширений. */
const DEFAULT_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.Latest,
}

/** Поверх настроек проекта: JavaScript и JSON - тоже модули, по ним тоже ходят. */
const ALWAYS: ts.CompilerOptions = { allowJs: true, resolveJsonModule: true }

const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json']

/**
 * Разбор tsconfig без обхода папок: нужны настройки (paths, moduleResolution) и что входит в
 * include, а не список файлов. Обход большого репозитория занял бы секунды.
 */
const CONFIG_HOST: ts.ParseConfigHost = {
  useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  readDirectory: () => [],
  fileExists: (path) => ts.sys.fileExists(path),
  readFile: (path) => ts.sys.readFile(path),
}

type Config = { stamp: number; parsed: ts.ParsedCommandLine | null }

const canonical = (path: string) => (ts.sys.useCaseSensitiveFileNames ? path : path.toLowerCase())

/** Входит ли файл в проект tsconfig: назван в files или лежит под папкой из include. */
const covers = (parsed: ts.ParsedCommandLine, file: string): boolean => {
  const key = canonical(file)

  return (
    parsed.fileNames.some((name) => canonical(name) === key) ||
    Object.keys(parsed.wildcardDirectories ?? {}).some((dir) =>
      key.startsWith(`${canonical(dir).replace(/\/$/, '')}/`),
    )
  )
}

/**
 * moduleResolution не задан, а module - не Node16/NodeNext: TypeScript взял бы Classic, который
 * не знает node_modules. Такие проекты собирает сборщик, и ищет он как bundler.
 */
const withResolution = (options: ts.CompilerOptions): ts.CompilerOptions =>
  options.moduleResolution !== undefined ||
  options.module === ts.ModuleKind.Node16 ||
  options.module === ts.ModuleKind.NodeNext
    ? options
    : { ...options, moduleResolution: ts.ModuleResolutionKind.Bundler }

/**
 * baseUrl старых tsconfig: TypeScript 6 считает его устаревшим, но проекты его ещё пишут, и
 * пути от него - настоящие пути проекта.
 */
const baseUrlOf = (options: ts.CompilerOptions): string | undefined =>
  (options as { baseUrl?: string }).baseUrl

/**
 * Файл стилей или картинки за своими типами: «./a.module.scss» TypeScript находит как
 * a.module.scss.d.ts (или a.module.d.scss.ts), а человек ждёт сам файл стилей.
 */
const assetBehindTypes = (resolved: string): string | null => {
  const candidates = [
    resolved.endsWith('.d.ts') ? resolved.slice(0, -'.d.ts'.length) : null,
    resolved.replace(/\.d\.([^./]+)\.ts$/, '.$1'),
  ]

  return (
    candidates.find(
      (candidate) =>
        candidate !== null &&
        candidate !== resolved &&
        /\.[^./]+$/.test(candidate) &&
        scriptKindOf(candidate) === null &&
        ts.sys.fileExists(candidate),
    ) ?? null
  )
}

/** Что подставляет синоним из paths: часть пути на месте звёздочки; null - не подходит. */
const aliasMatch = (pattern: string, spec: string): string | null => {
  const star = pattern.indexOf('*')

  if (star < 0) return spec === pattern ? '' : null

  const head = pattern.slice(0, star)
  const tail = pattern.slice(star + 1)

  return spec.length >= head.length + tail.length && spec.startsWith(head) && spec.endsWith(tail)
    ? spec.slice(head.length, spec.length - tail.length)
    : null
}

/**
 * Куда ведёт путь импорта - так, как его разрешает TypeScript проекта: ближайший tsconfig (или
 * jsconfig) файла, а у составного (references) - тот, в чей include файл входит. Синонимы путей,
 * пакеты с их exports и типами, «.js» на месте «.ts» - всё от TypeScript. То, чего TypeScript
 * не разрешает (стили, картинки, «?raw»), ищется файлом по пути и синонимам.
 */
export class ModuleResolver {
  private readonly configs = new Map<string, Config>()
  private readonly nearest = new Map<string, string | null>()

  resolve(spec: string, from: string): string | null {
    const bare = spec.replace(/[?#].*$/, '')

    if (!bare) return null

    const options = {
      ...withResolution(this.configFor(from)?.options ?? DEFAULT_OPTIONS),
      ...ALWAYS,
    }
    const resolved = ts.resolveModuleName(bare, from, options, ts.sys).resolvedModule

    if (resolved) return assetBehindTypes(resolved.resolvedFileName) ?? resolved.resolvedFileName

    return this.plainFile(bare, from, options)
  }

  private plainFile(spec: string, from: string, options: ts.CompilerOptions): string | null {
    const candidates = spec.startsWith('.')
      ? [posix.normalize(posix.join(posix.dirname(from), spec))]
      : spec.startsWith('/')
        ? [spec]
        : this.aliasTargets(spec, options)

    return candidates.find((candidate) => ts.sys.fileExists(candidate)) ?? null
  }

  private aliasTargets(spec: string, options: ts.CompilerOptions): string[] {
    // pathsBasePath - папка tsconfig, где написаны paths: их пути считаются от неё.
    const baseUrl = baseUrlOf(options)
    const base = (options as { pathsBasePath?: string }).pathsBasePath ?? baseUrl
    const targets = Object.entries(options.paths ?? {}).flatMap(([pattern, list]) => {
      const part = aliasMatch(pattern, spec)

      return part === null || !base
        ? []
        : list.map((target) => posix.normalize(posix.join(base, target.replace('*', part))))
    })

    return baseUrl ? [...targets, posix.join(baseUrl, spec)] : targets
  }

  private configFor(file: string): ts.ParsedCommandLine | null {
    const path = this.configPathFor(posix.dirname(file))
    const nearest = path ? this.parsed(path) : null

    if (!nearest?.projectReferences?.length || covers(nearest, file)) return nearest

    for (const reference of nearest.projectReferences) {
      const sub = this.parsed(ts.resolveProjectReferencePath(reference))

      if (sub && covers(sub, file)) return sub
    }

    return nearest
  }

  private configPathFor(dir: string): string | null {
    const known = this.nearest.get(dir)

    if (known !== undefined) return known

    const own = CONFIG_NAMES.map((name) => posix.join(dir, name)).find((path) =>
      ts.sys.fileExists(path),
    )
    const parent = posix.dirname(dir)
    const found = own ?? (parent === dir ? null : this.configPathFor(parent))

    this.nearest.set(dir, found)

    return found
  }

  /** Разобранный tsconfig; поменяли файл - разбирается заново. */
  private parsed(path: string): ts.ParsedCommandLine | null {
    const stamp = ts.sys.getModifiedTime?.(path)?.getTime() ?? 0
    const known = this.configs.get(path)

    if (known?.stamp === stamp) return known.parsed

    const json = ts.readConfigFile(path, (name) => ts.sys.readFile(name))
    const parsed = json.error
      ? null
      : ts.parseJsonConfigFileContent(
          json.config,
          CONFIG_HOST,
          posix.dirname(path),
          undefined,
          path,
        )

    this.configs.set(path, { stamp, parsed })

    return parsed
  }
}
