import type { GitLineStats, GitChangeList } from '@shared/git'

import { RecordReader } from '../search/record-reader'
import type { FileLineCounter } from './file-line-counter'
import { hasCommits } from './git-head'
import { NumstatParser } from './git-numstat-output'
import type { NumstatSum } from './git-numstat-output'
import { streamGit } from './git-stream'
import { GIT_STATUS_ENV, GIT_STATUS_TIMEOUT_MS } from './git.constants'

/**
 * Разница с HEAD по строкам: индекс и рабочая папка вместе, как в списке изменений.
 * Переименования - с поиском (-M) при любых настройках человека: иначе переезд файла выглядел
 * бы удалением и новым файлом целиком. textconv не запускаем: это чужие программы, а считаем
 * строки самого файла. Подмодулей нет и в списке изменений. `-- .` - только папка проекта.
 */
const NUMSTAT_ARGS = [
  'diff',
  '--numstat',
  '-z',
  '-M',
  '--no-textconv',
  '--no-ext-diff',
  '--ignore-submodules',
  'HEAD',
  '--',
  '.',
]

/** Строки файлов, которые знает git. partial - git не успел, сумма не вся. */
type TrackedLines = NumstatSum & { partial: boolean }

/** Ни одной строки: в HEAD сравнивать не с чем или менять нечего. */
const NOTHING: TrackedLines = { added: 0, deleted: 0, partial: false }

/**
 * `git diff HEAD --numstat` с разбором на лету. unborn - коммитов ещё нет, и HEAD сравнивать
 * не с чем. null - git упал.
 */
const readTrackedLines = async (rootPath: string): Promise<TrackedLines | 'unborn' | null> => {
  const parser = new NumstatParser()
  const reader = new RecordReader([0])
  const outcome = await streamGit(rootPath, NUMSTAT_ARGS, {
    signal: AbortSignal.timeout(GIT_STATUS_TIMEOUT_MS),
    env: GIT_STATUS_ENV,
    onData: (chunk) => {
      for (const { fields } of reader.push(chunk)) parser.push(fields[0] ?? '')

      return true
    },
  })

  if (outcome.kind === 'stopped') return { ...parser.result(), partial: true }
  if (outcome.exitCode === 0) return { ...parser.result(), partial: false }
  if (!(await hasCommits(rootPath))) return 'unborn'

  console.warn(`[git] diff --numstat завершился с кодом ${outcome.exitCode}:`, outcome.stderr)

  return null
}

/**
 * Счёт строк проекта с последнего коммита - для шапки. changes - список изменений того же
 * прочтения: из него число файлов и новые файлы. Новых git не считает (их нет в индексе),
 * их строки берёт counter с диска; коммитов ещё нет - с диска весь список: в HEAD пусто.
 * Изменений нет - git не зовём вовсе. null - git не ответил.
 */
export const readGitLineStats = async (
  rootPath: string,
  changes: GitChangeList,
  counter: FileLineCounter,
): Promise<GitLineStats | null> => {
  const { files, truncated } = changes

  if (files.length === 0 && !truncated) {
    await counter.count(rootPath, [])

    return { ...NOTHING, files: 0 }
  }

  try {
    const tracked = await readTrackedLines(rootPath)

    if (tracked === null) return null

    const unborn = tracked === 'unborn'
    const fresh = files.filter((change) => unborn || change.kind === 'untracked')
    const added = await counter.count(
      rootPath,
      fresh.map((change) => change.path),
    )
    const known = unborn ? NOTHING : tracked

    return {
      added: known.added + added,
      deleted: known.deleted,
      files: files.length,
      partial: known.partial || truncated,
    }
  } catch (error) {
    console.warn('[git] строки не посчитались:', error)

    return null
  }
}
