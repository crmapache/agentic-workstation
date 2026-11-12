import { stat, readFile } from 'node:fs/promises'

import type {
  FileMove,
  EntryKind,
  FileOpOutcome,
  ReferencePlan,
  FileMoveOutcome,
} from '@shared/file-ops'
import type { HistoryCause } from '@shared/local-history'
import type { ProjectFileList } from '@shared/search'

import { checkMove, copyEntry, moveEntry, trashEntry, createEntry } from './file-ops'
import { resolveInsideRoot } from './project-paths'
import { decodeText } from './text-file.utils'
import { writeTextFile } from './text-write'
import { pathAliases, isPathConfig } from './references/path-aliases'
import type { FileEdits } from './references/reference-plan'
import { planFile, applyEdits, indexedMove, projectIndex } from './references/reference-plan'
import { flavorOf } from './references/specifiers'

/** Файл больше этого - сборка, лог или данные, а не исходник со ссылками: не читаем. */
const MAX_SOURCE_BYTES = 1_000_000

/** Сколько файлов читать разом: проект на десятки тысяч файлов - не десятки тысяч открытых. */
const READ_BATCH = 64

/** Сколько файлов разбирать подряд, не отдавая цикл событий: главный процесс не замирает. */
const PLAN_BATCH = 200

const breathe = () => new Promise((resolve) => setImmediate(resolve))

/**
 * Локальная история (ADR 0045): перенос едет вместе с историей файла, правка ссылок - своей
 * причиной, а не «извне», удаляемое запоминается до корзины.
 */
export type FileOpsHistory = {
  expect: (root: string, path: string, cause: HistoryCause) => void
  settle: (root: string, paths: readonly string[], cause?: HistoryCause) => Promise<void>
  /** Перенос - работой в очереди истории проекта: её сверка не увидит его наполовину. */
  move: (root: string, from: string, rename: () => Promise<FileOpOutcome>) => Promise<FileOpOutcome>
}

export type FileOpsHost = {
  /** Файлы проекта без игнорируемых - тот же список, что у поиска по имени. */
  listFiles: (root: string) => Promise<ProjectFileList>
  /** В корзину системы (shell.trashItem). */
  trash: (absolute: string) => Promise<void>
  history?: FileOpsHistory
}

/** Тексты файлов, где могут быть ссылки, и конфигов с синонимами путей. */
const readSources = async (
  root: string,
  paths: readonly string[],
): Promise<Map<string, string>> => {
  const texts = new Map<string, string>()
  const wanted = paths.filter((path) => flavorOf(path) !== null || isPathConfig(path))

  for (let at = 0; at < wanted.length; at += READ_BATCH) {
    await Promise.all(
      wanted.slice(at, at + READ_BATCH).map(async (path) => {
        const absolute = resolveInsideRoot(root, path)
        // Размер - до чтения: собранный бандл в репозитории не читается целиком зря.
        const size = absolute ? (await stat(absolute).catch(() => null))?.size : undefined
        const buffer =
          absolute && size !== undefined && size <= MAX_SOURCE_BYTES
            ? await readFile(absolute).catch(() => null)
            : null

        // Только честный UTF-8: файл в cp1251 после «правки» потерял бы всю кириллицу.
        const decoded = buffer ? decodeText(buffer) : null

        if (decoded) texts.set(path, decoded.text)
      }),
    )
  }

  return texts
}

/**
 * Действия с файлами из дерева (ADR 0043): создать, переименовать и перенести с правкой ссылок,
 * скопировать, в корзину. Ссылки ищутся заново на каждый перенос - по текущему диску, а не по
 * снимку, сделанному, пока человек набирал имя.
 */
export class FileOpsService {
  /** Действия проекта - по очереди: второй перенос считает план по диску после первого. */
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(private readonly host: FileOpsHost) {}

  create(root: string, parent: string, name: string, kind: EntryKind): Promise<FileOpOutcome> {
    return this.queued(root, () => createEntry(root, parent, name, kind))
  }

  async references(root: string, move: FileMove): Promise<ReferencePlan> {
    const { edits, truncated } = await this.plan(root, move)

    return {
      files: edits.map((file) => ({ path: file.path, count: file.edits.length })),
      total: edits.reduce((sum, file) => sum + file.edits.length, 0),
      truncated,
    }
  }

  /**
   * Перенос; с updateReferences - сначала план правок по старым местам, потом перенос, потом
   * правки в файлах уже на новых местах. Файл, поменявшийся между планом и записью, не
   * трогается: правка легла бы мимо.
   */
  move(root: string, move: FileMove, updateReferences: boolean): Promise<FileMoveOutcome> {
    return this.queued(root, () => this.moveNow(root, move, updateReferences))
  }

  private async moveNow(
    root: string,
    move: FileMove,
    updateReferences: boolean,
  ): Promise<FileMoveOutcome> {
    const checked = await checkMove(root, move.from, move.to)

    if ('ok' in checked) return checked

    const { edits } = updateReferences ? await this.plan(root, move) : { edits: [] }
    const { history } = this.host
    const rename = () => moveEntry(root, move.from, move.to)
    const moved = await (history ? history.move(root, move.from, rename) : rename())

    if (!moved.ok) return moved

    for (const file of edits) history?.expect(root, file.movedTo, 'refactor')

    const written = await Promise.all(edits.map((file) => this.rewrite(root, file)))

    await history?.settle(
      root,
      edits.map((file) => file.movedTo),
      'refactor',
    )

    return {
      ok: true,
      path: moved.path,
      references: written.reduce((sum, count) => sum + count, 0),
      files: written.filter((count) => count > 0).length,
      skipped: written.filter((count) => count === 0).length,
    }
  }

  copy(root: string, from: string, toDirectory: string): Promise<FileOpOutcome> {
    return this.queued(root, () => copyEntry(root, from, toDirectory))
  }

  /** В корзину; история сначала запоминает последнее содержимое - его можно вернуть. */
  trash(root: string, path: string): Promise<FileOpOutcome> {
    return this.queued(root, async () => {
      const { history } = this.host

      await history?.settle(root, [path])

      const outcome = await trashEntry(root, path, this.host.trash)

      if (outcome.ok) await history?.settle(root, [path])

      return outcome
    })
  }

  private queued<T>(root: string, job: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(root) ?? Promise.resolve()).then(job, job)

    this.queues.set(
      root,
      run.catch(() => undefined),
    )

    return run
  }

  private async plan(
    root: string,
    move: FileMove,
  ): Promise<{ edits: FileEdits[]; truncated: boolean }> {
    const { paths, truncated } = await this.host.listFiles(root)
    const texts = await readSources(root, paths)
    const read = (path: string) => texts.get(path) ?? null
    const aliases = pathAliases(paths.filter(isPathConfig), read)
    const index = projectIndex(paths)
    const planned = indexedMove(index, move)
    const edits: FileEdits[] = []

    for (const [at, [path, body]] of [...texts].entries()) {
      if (at > 0 && at % PLAN_BATCH === 0) await breathe()

      try {
        const file = planFile(index, aliases, planned, path, body)

        if (file) edits.push(file)
      } catch (error) {
        // Один странный файл не мешает переносу: его ссылки просто не правятся.
        console.warn('[files] ссылки в файле не разобрались:', path, error)
      }
    }

    return { edits: edits.sort((left, right) => left.path.localeCompare(right.path)), truncated }
  }

  /**
   * Правки одного файла на его новом месте; ответ - сколько легло (0 - файл не тронут). Пишет
   * обычная запись файлов проекта: целиком через временный файл, не за проект по ссылке, и
   * выход из IDE её дождётся.
   */
  private async rewrite(root: string, file: FileEdits): Promise<number> {
    const absolute = resolveInsideRoot(root, file.movedTo)

    if (!absolute) return 0

    try {
      const decoded = decodeText(await readFile(absolute))
      const next = decoded ? applyEdits(decoded.text, file.edits) : null

      if (!decoded || next === null) return 0

      const written = await writeTextFile(root, file.movedTo, {
        text: next,
        bom: decoded.bom,
        expected: null,
      })

      return written.kind === 'saved' ? file.edits.length : 0
    } catch (error) {
      console.warn('[files] ссылки не переписались:', error)

      return 0
    }
  }
}
