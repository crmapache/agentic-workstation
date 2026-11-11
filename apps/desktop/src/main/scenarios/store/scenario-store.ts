import { rm, stat, mkdir, rename, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Scenario, ScenarioCode, ScenarioScope } from '@shared/scenarios'
import { SCENARIO_VERSION } from '@shared/scenarios'

import { LockedFile } from './locked-file'
import { freshId, isUsableId, scenarioFile, parseScenario } from './scenario-parse'

/** Порядок полки рядом со сценариями: проектный едет с репозиторием, личный - за человеком. */
const ORDER = '.order.json'

/**
 * Две полки сценариев (ScenarioStore в ACC): проектная `.claude/scenarios/` репозитория и
 * личная `scenarios/` в доме CLI - там, где он держит команды и скиллы. Полка - это где лежит
 * файл; сохранение под другой полкой файл переносит: две копии под одним id - сценарий,
 * который правят на одной полке, а запускают с другой.
 */
export class ScenarioStore {
  constructor(
    private readonly projectPath: string,
    private readonly claudeHome: () => Promise<string>,
  ) {}

  async dirOf(scope: ScenarioScope): Promise<string> {
    return scope === 'user'
      ? join(await this.claudeHome(), 'scenarios')
      : join(this.projectPath, '.claude', 'scenarios')
  }

  /** Есть ли куда положить проектный сценарий: папка проекта на месте. */
  async canShare(): Promise<boolean> {
    return (await stat(this.projectPath).catch(() => null))?.isDirectory() === true
  }

  /**
   * Полка по порядку; null - полку не прочитать (ветка без папки - это пусто, а вот
   * отказавший диск - нет: прочитанный как «пусто», он стёр бы часы и очередь навсегда).
   */
  async shelf(scope: ScenarioScope): Promise<Scenario[] | null> {
    const dir = await this.dirOf(scope)
    const names = await readdir(dir).catch((error: NodeJS.ErrnoException) =>
      error.code === 'ENOENT' ? [] : null,
    )

    if (names === null) return null

    const rank = new Map((await this.orderOf(dir)).map((id, at) => [id, at]))
    const files = names.filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    const read = await Promise.all(files.map((name) => this.readOne(join(dir, name), scope)))

    return read
      .flatMap((scenario) => (scenario ? [scenario] : []))
      .sort((left, right) => left.createdAt - right.createdAt)
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
  }

  async find(id: string, scope: ScenarioScope): Promise<Scenario | null> {
    return (await this.shelf(scope))?.find((scenario) => scenario.id === id) ?? null
  }

  /** Записать на полку; на другой полке файл того же id убирается. null - не записалось. */
  async save(scenario: Scenario, scope: ScenarioScope): Promise<Scenario | null> {
    const now = Date.now()
    const stored: Scenario = {
      ...scenario,
      version: SCENARIO_VERSION,
      id: isUsableId(scenario.id) ? scenario.id : freshId(),
      name: scenario.name.trim() || 'Untitled',
      createdAt: scenario.createdAt > 0 ? scenario.createdAt : now,
      updatedAt: now,
      scope,
    }

    try {
      const dir = await this.dirOf(scope)

      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, `${stored.id}.json`), scenarioFile(stored), 'utf8')
      await rm(join(await this.dirOf(scope === 'user' ? 'project' : 'user'), `${stored.id}.json`), {
        force: true,
      })

      return stored
    } catch (error) {
      console.warn('[scenarios] сценарий не записался:', error)

      return null
    }
  }

  async delete(id: string, scope: ScenarioScope): Promise<boolean> {
    if (!isUsableId(id)) return false

    const file = join(await this.dirOf(scope), `${id}.json`)

    if (!(await stat(file).catch(() => null))?.isFile()) return false

    return rm(file).then(
      () => true,
      () => false,
    )
  }

  /** Копия со своими id всего внутри: иначе вторая копия отзывалась бы на ключ первой. */
  async duplicate(id: string, scope: ScenarioScope): Promise<Scenario | null> {
    const source = await this.find(id, scope)

    if (!source) return null

    return this.save(
      {
        ...source,
        id: freshId(),
        name: `${source.name} copy`,
        createdAt: 0,
        inputs: source.inputs.map((input) => ({ ...input, id: freshId() })),
        stages: source.stages.map((stage) => ({
          ...stage,
          id: freshId(),
          cards: stage.cards.map((card) => ({
            ...card,
            id: freshId(),
            slots: card.slots.map((slot) => ({ ...slot, id: freshId() })),
          })),
        })),
      },
      scope,
    )
  }

  /**
   * Строку перетащили: на другую полку файл переносится как лежит (не перечитать-записать),
   * место - соседом, перед которым положили (пусто - в конец). Ответ - код отказа или null.
   */
  async place(
    id: string,
    from: ScenarioScope,
    to: ScenarioScope,
    before: string,
  ): Promise<ScenarioCode | null> {
    if (!isUsableId(id)) return 'scenarioGone'

    if (from !== to) {
      const moved = await this.move(id, from, to)

      if (moved) return moved
    }

    const dir = await this.dirOf(to)
    const standing = (await this.shelf(to))?.map((scenario) => scenario.id)

    if (!standing) return 'orderNotWritten'
    if (!standing.includes(id)) return 'scenarioGone'

    const others = standing.filter((other) => other !== id)
    const at = before ? others.indexOf(before) : -1
    const order = at < 0 ? [...others, id] : [...others.slice(0, at), id, ...others.slice(at)]
    const written = await new LockedFile(join(dir, ORDER)).put(JSON.stringify({ order }))

    return written ? null : 'orderNotWritten'
  }

  private async move(id: string, from: ScenarioScope, to: ScenarioScope) {
    const source = join(await this.dirOf(from), `${id}.json`)
    const dir = await this.dirOf(to)
    const landing = join(dir, `${id}.json`)

    if (!(await stat(source).catch(() => null))?.isFile()) return 'scenarioGone'
    if (await stat(landing).catch(() => null)) return 'scenarioOnBothShelves'

    try {
      await mkdir(dir, { recursive: true })
      await rename(source, landing)

      return null
    } catch (error) {
      console.warn('[scenarios] сценарий не перенёсся на другую полку:', error)

      return 'scenarioNotMoved'
    }
  }

  /** Порядок полки; нечитаемый стоит только мест, не строк. */
  private async orderOf(dir: string): Promise<string[]> {
    const stored = await new LockedFile(join(dir, ORDER)).read()

    if (stored.kind !== 'text') return []

    try {
      const { order } = JSON.parse(stored.text) as { order?: unknown }

      return Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  }

  private async readOne(file: string, scope: ScenarioScope): Promise<Scenario | null> {
    try {
      const [raw, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
      const parsed = parseScenario(JSON.parse(raw) as unknown, scope)

      if (!parsed) return null

      const fileId = file.slice(file.lastIndexOf('/') + 1, -'.json'.length)

      return {
        ...parsed,
        id: parsed.id.trim() || fileId,
        name: parsed.name.trim() || 'Untitled',
        createdAt: parsed.createdAt > 0 ? parsed.createdAt : info.mtimeMs,
        updatedAt: parsed.updatedAt > 0 ? parsed.updatedAt : info.mtimeMs,
      }
    } catch (error) {
      console.info('[scenarios] сценарий не читается:', file, (error as Error).message)

      return null
    }
  }
}
