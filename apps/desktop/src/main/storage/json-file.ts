import { chmod, mkdir, rename, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** mode - права файла (0o600 - только владелец): ставятся на каждой записи. */
export type JsonFileOptions = { mode?: number }

/**
 * JSON-файл с состоянием приложения в userData. Запись атомарная: сначала во
 * временный файл, потом rename - оборванная запись не оставит полфайла.
 */
export class JsonFile<T> {
  constructor(
    private readonly path: string,
    private readonly options: JsonFileOptions = {},
  ) {}

  /** Содержимое файла или null, если файла нет или он не разбирается. */
  async read(): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as unknown
    } catch {
      return null
    }
  }

  async write(value: T): Promise<void> {
    const temporary = `${this.path}.tmp`

    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(temporary, JSON.stringify(value, null, 2), {
      encoding: 'utf8',
      mode: this.options.mode,
    })

    // Временный файл мог остаться от оборванной записи со старыми правами: mode при
    // создании его не поменяет.
    if (this.options.mode !== undefined) await chmod(temporary, this.options.mode)

    await rename(temporary, this.path)
  }
}
