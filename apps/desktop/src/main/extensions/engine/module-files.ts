import { statSync, readFileSync, realpathSync } from 'node:fs'
import { sep, posix, dirname, resolve, relative, isAbsolute } from 'node:path'

/** Сколько может весить один модуль расширения и все вместе. */
export const MODULE_MAX_BYTES = 2 * 1024 * 1024
export const MODULES_TOTAL_MAX_BYTES = 8 * 1024 * 1024

/** Расширения файлов, которые грузятся как модули: только JavaScript. */
const MODULE_EXTENSIONS = ['.js', '.mjs']

/** Отказ загрузчика модулей: его текст уходит в журнал расширения как есть. */
export class ModuleError extends Error {}

/**
 * Имя модуля для QuickJS - путь от корня папки расширения через «/». Импорт расширения -
 * только относительный (`./util.js`), из своей папки: голые имена пакетов и абсолютные пути
 * загрузчик не знает, выход за папку - отказ.
 */
export const normalizeModule = (base: string, request: string): string => {
  if (!request.startsWith('./') && !request.startsWith('../')) {
    throw new ModuleError(
      `Cannot import "${request}": only relative imports from the extension folder work.`,
    )
  }

  const from = base.includes('/') ? posix.dirname(base) : ''
  const name = posix.normalize(posix.join(from, request))

  if (name.startsWith('../') || name === '..' || posix.isAbsolute(name)) {
    throw new ModuleError(`Cannot import "${request}": it is outside the extension folder.`)
  }

  return name
}

/**
 * Читает модули расширения из его папки: путь проверяется по настоящему пути (ссылка наружу -
 * отказ), только .js и .mjs, с пределом размера на модуль и на все.
 */
export class ModuleFiles {
  private readonly root: string
  private loaded = 0

  constructor(dir: string) {
    this.root = realpathSync(dir)
  }

  read(name: string): string {
    if (!MODULE_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      throw new ModuleError(`Cannot import "${name}": modules are .js or .mjs files.`)
    }

    const path = this.inside(name)
    const size = statSync(path).size

    if (size > MODULE_MAX_BYTES) throw new ModuleError(`Module "${name}" is larger than 2 MB.`)

    this.loaded += size

    if (this.loaded > MODULES_TOTAL_MAX_BYTES) {
      throw new ModuleError('The extension modules together are larger than 8 MB.')
    }

    return readFileSync(path, 'utf8')
  }

  private inside(name: string): string {
    let real: string

    try {
      real = realpathSync(resolve(this.root, ...name.split('/')))
    } catch {
      throw new ModuleError(`Module "${name}" is not found in the extension folder.`)
    }

    const path = relative(this.root, real)

    if (path === '' || path.startsWith(`..${sep}`) || path === '..' || isAbsolute(path)) {
      throw new ModuleError(`Module "${name}" points outside the extension folder.`)
    }

    // Папка модуля тоже внутри: настоящий путь мог прийти ссылкой на папку.
    if (relative(this.root, dirname(real)).startsWith('..')) {
      throw new ModuleError(`Module "${name}" points outside the extension folder.`)
    }

    return real
  }
}
