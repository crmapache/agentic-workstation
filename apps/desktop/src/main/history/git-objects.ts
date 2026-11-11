import { gitWithInput } from './git-input'
import { GIT_BATCH } from './history.constants'

/** Сколько версий читать из git одним вызовом: каждая - до предела размера файла истории. */
const READ_GROUP = 16

/** git cat-file с ключами на входе; не репозиторий, нет git, сбой - null. */
const catFile = async (cwd: string, mode: '--batch' | '--batch-check', keys: readonly string[]) => {
  const output = await gitWithInput(cwd, ['cat-file', mode], `${keys.join('\n')}\n`)

  return output?.code === 0 ? output.stdout : null
}

const groupsOf = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

/**
 * Какие из ключей git проекта знает как файл (blob). Ключ истории и git - одна и та же
 * формула, поэтому закоммиченное содержимое история у себя не держит.
 */
export const keysInGit = async (cwd: string, keys: readonly string[]): Promise<Set<string>> => {
  const known = new Set<string>()

  for (const group of groupsOf(keys, GIT_BATCH)) {
    const output = await catFile(cwd, '--batch-check', group)

    if (output === null) return known

    for (const line of output.toString('utf8').split('\n')) {
      const [key = '', type] = line.split(' ')

      if (type === 'blob') known.add(key)
    }
  }

  return known
}

/**
 * Разбор ответа `git cat-file --batch`: «<ключ> <тип> <размер>\n<байты>\n» на объект,
 * «<ключ> missing\n» на неизвестный. Байты - как в объекте, без фильтров checkout: ключ
 * считается от них же.
 */
export const parseCatFileBatch = (output: Buffer): Map<string, Buffer> => {
  const objects = new Map<string, Buffer>()
  let at = 0

  while (at < output.length) {
    const lineEnd = output.indexOf(0x0a, at)

    if (lineEnd < 0) break

    const [key = '', type, sizeText] = output.subarray(at, lineEnd).toString('utf8').split(' ')
    const size = Number(sizeText)

    at = lineEnd + 1

    if (type === undefined || type === 'missing' || !Number.isInteger(size)) continue
    if (type === 'blob') objects.set(key, Buffer.from(output.subarray(at, at + size)))

    at += size + 1
  }

  return objects
}

/** Содержимое версий из git проекта по ключам; чего git не знает - нет в ответе. */
export const readFromGit = async (
  cwd: string,
  keys: readonly string[],
): Promise<Map<string, Buffer>> => {
  const objects = new Map<string, Buffer>()

  for (const group of groupsOf(keys, READ_GROUP)) {
    const output = await catFile(cwd, '--batch', group)

    if (output === null) return objects

    for (const [key, bytes] of parseCatFileBatch(output)) objects.set(key, bytes)
  }

  return objects
}
