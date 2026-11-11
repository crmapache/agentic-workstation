import { rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { isProviderId } from '@shared/providers'
import type { RunSummary, ScenarioRun } from '@shared/scenario-runs'
import { isRunFinished } from '@shared/scenario-runs'

import { abandoned, summarise } from './run-summary'
import { isUsableId, parseScenario } from './scenario-parse'

const RECORD = 'run.json'
const SUMMARY = 'summary.json'

const isRaw = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Запись прогона с диска; пишет её только IDE, но файл могли тронуть - поля по умолчанию. */
const parseRun = (value: unknown): ScenarioRun | null => {
  if (!isRaw(value) || typeof value['id'] !== 'string') return null

  const scope = value['scope'] === 'user' ? 'user' : 'project'
  const snapshot = parseScenario(value['snapshot'], scope)

  if (!snapshot) return null

  return {
    projectPath: '',
    cwd: '',
    queueId: '',
    itemId: '',
    scenarioId: '',
    scenarioName: '',
    startedAt: 0,
    finishedAt: 0,
    state: 'failed',
    runFrom: '',
    inputs: {},
    total: 0,
    headConversationId: '',
    steps: [],
    notes: [],
    question: null,
    failure: '',
    error: '',
    cost: 0,
    tokens: 0,
    idle: 0,
    rested: 0,
    restingSince: 0,
    writtenAt: 0,
    starred: false,
    answering: false,
    limit: null,
    ...(value as Partial<ScenarioRun>),
    id: value['id'],
    // Провайдер из чужой записи, которого IDE не знает, - Claude: других прогонов не было.
    provider: isProviderId(value['provider']) ? value['provider'] : 'claude',
    scope,
    snapshot,
  }
}

/**
 * Прогоны проекта в userData (RunStore в ACC): папка на прогон, в ней `run.json` со снимком
 * сценария и `summary.json` для строки списка - сотня прогонов это сотня маленьких чтений, а не
 * сотня разобранных снимков ради даты.
 */
export class RunStore {
  constructor(private readonly dir: string) {}

  async summaries(): Promise<RunSummary[]> {
    const read = await Promise.all(
      (await this.folders()).map(async (id) => {
        try {
          const summary = JSON.parse(await readFile(join(this.dir, id, SUMMARY), 'utf8')) as unknown

          return isRaw(summary) && typeof summary['id'] === 'string'
            ? (summary as RunSummary)
            : null
        } catch {
          return null
        }
      }),
    )

    return read
      .flatMap((summary) => (summary ? [summary] : []))
      .sort((left, right) => right.startedAt - left.startedAt)
  }

  async read(id: string): Promise<ScenarioRun | null> {
    if (!isUsableId(id)) return null

    try {
      return parseRun(JSON.parse(await readFile(join(this.dir, id, RECORD), 'utf8')) as unknown)
    } catch {
      return null
    }
  }

  /** Записать прогон и его сводку; writtenAt - момент, когда IDE последний раз его вела. */
  async keep(run: ScenarioRun, now = Date.now()): Promise<void> {
    if (!isUsableId(run.id)) return

    const folder = join(this.dir, run.id)
    const stamped = { ...run, writtenAt: now }

    try {
      await mkdir(folder, { recursive: true })
      await writeFile(join(folder, RECORD), JSON.stringify(stamped), 'utf8')
      await writeFile(join(folder, SUMMARY), JSON.stringify(summarise(stamped)), 'utf8')
    } catch (error) {
      console.warn('[scenarios] прогон не записался:', error)
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!isUsableId(id)) return false

    return rm(join(this.dir, id), { recursive: true, force: true }).then(
      () => true,
      () => false,
    )
  }

  /** Звёздочка - старым штампом: им закрывают упавшие, звезда утром его не двигает. */
  async star(id: string, starred: boolean): Promise<boolean> {
    const run = await this.read(id)

    if (!run) return false

    await this.keep({ ...run, starred }, run.writtenAt)

    return true
  }

  /** Разговоры всех прогонов: голова и карточки - для книги скрытых из истории. */
  async conversations(): Promise<string[]> {
    const runs = await Promise.all((await this.folders()).map((id) => this.read(id)))

    return runs
      .flatMap((run) => (run ? [run] : []))
      .sort((left, right) => left.startedAt - right.startedAt)
      .flatMap((run) => [run.headConversationId, ...run.steps.map((step) => step.conversationId)])
      .filter(Boolean)
  }

  /** Брошенные прогоны (IDE закрыли посреди работы) - закрыть: иначе очередь ждала бы их вечно. */
  async repairAbandoned(alive: ReadonlySet<string>, now = Date.now()): Promise<void> {
    for (const summary of await this.summaries()) {
      if (isRunFinished(summary.state) || alive.has(summary.id)) continue

      const run = await this.read(summary.id)

      if (run) await this.keep(abandoned(run, now), now)
    }
  }

  private async folders(): Promise<string[]> {
    const entries = await readdir(this.dir, { withFileTypes: true }).catch(() => [])

    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  }
}
