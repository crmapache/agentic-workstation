import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  RunNote,
  RunStep,
  RunState,
  RunFailure,
  RunSummary,
  ScenarioRun,
} from '@shared/scenario-runs'

import { isRaw, RECORD, SUMMARY, parseRun } from './run-store'
import { isUsableId } from './scenario-parse'

/** Дом плагина ACC: его книги прогонов, очередей и расписаний на этой машине. */
export const ACC_HOME = join(homedir(), '.amazing-claude-code')

const RUN_STATES: ReadonlySet<string> = new Set<RunState>([
  'starting',
  'running',
  'paused',
  'blocked',
  'done',
  'failed',
  'stopped',
])

const RUN_FAILURES: ReadonlySet<string> = new Set<RunFailure>([
  'noHead',
  'noStart',
  'tooLong',
  'headSilent',
  'crashed',
  'refused',
  'noVerdict',
  'retries',
  'stopped',
  'undone',
  'headGaveUp',
  'longList',
])

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * id разговора CLI из чужой записи: по нему склеивается путь к транскрипту и --resume, поэтому
 * берётся только то, что похоже на id сессии CLI, - «../» в записи ACC не уведёт за папку.
 */
const sessionIdOf = (value: unknown): string => {
  const id = text(value)

  return /^[0-9a-f-]{8,64}$/i.test(id) ? id : ''
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const answers = (value: unknown): Record<string, string> =>
  isRaw(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([key, one]) =>
          typeof one === 'string' ? [[key, one]] : [],
        ),
      )
    : {}

/**
 * Папка проекта в книгах ACC - как её называет сам плагин (ShortHash): SHA-256 пути в base64url,
 * первые 16 знаков. Путь - как его открыл человек, без разворота ссылок: так же делает ACC.
 */
export const accProjectKey = (projectPath: string): string =>
  createHash('sha256').update(projectPath, 'utf8').digest('base64url').slice(0, 16)

/** Строка списка из сводки ACC: полей IDE в ней нет - очереди, стоянки, дороги и звезды. */
export const accSummary = (raw: unknown, projectPath: string): RunSummary | null => {
  if (!isRaw(raw) || !isUsableId(text(raw['id']))) return null

  const state = text(raw['state'])
  const failure = text(raw['failure'])

  return {
    id: text(raw['id']),
    projectPath,
    provider: 'claude',
    queueId: '',
    itemId: '',
    scenarioId: text(raw['scenarioId']),
    scenarioName: text(raw['scenarioName']),
    scope: raw['scope'] === 'user' ? 'user' : 'project',
    startedAt: count(raw['startedAt']),
    finishedAt: count(raw['finishedAt']),
    state: RUN_STATES.has(state) ? (state as RunState) : 'failed',
    total: count(raw['total']),
    done: count(raw['done']),
    failure: RUN_FAILURES.has(failure) ? (failure as RunFailure) : '',
    cost: count(raw['cost']),
    inputs: answers(raw['inputs']),
    tokens: count(raw['tokens']),
    idle: count(raw['idle']),
    rested: count(raw['rested']),
    restingSince: count(raw['restingSince']),
    stageTitle: '',
    at: text(raw['at']),
    asking: text(raw['asking']),
    roadmap: [],
    starred: raw['starred'] === true,
    limit: null,
    origin: 'acc',
  }
}

/**
 * Запись прогона ACC целиком. Старые записи плагина без части полей шага и заметки (взятие
 * работы головой, стоянка, кто сказал) - те же поля по умолчанию, что у IDE: таймлайн их ждёт.
 * Работа шла в папке проекта - worktree у ACC нет.
 */
export const accRun = (raw: unknown, projectPath: string): ScenarioRun | null => {
  const run = parseRun(raw, 'acc')

  if (!run) return null

  // Записи с диска: тип обещает поля, которых у старых записей ACC нет.
  const steps: Partial<RunStep>[] = Array.isArray(run.steps) ? run.steps : []
  const notes: Partial<RunNote>[] = Array.isArray(run.notes) ? run.notes : []

  return {
    ...run,
    projectPath,
    cwd: projectPath,
    headConversationId: sessionIdOf(run.headConversationId),
    steps: steps.map(
      (step) =>
        ({
          ...step,
          conversationId: sessionIdOf(step.conversationId),
          takeOver: step.takeOver ?? '',
          rested: step.rested ?? 0,
          item: step.item ?? null,
        }) as RunStep,
    ),
    notes: notes.map(
      (note) =>
        ({
          ...note,
          who: note.who ?? '',
          deliveredAt: note.deliveredAt ?? note.at ?? 0,
          relayed: note.relayed ?? '',
          move: note.move ?? null,
        }) as RunNote,
    ),
  }
}

/**
 * Прогоны, которые плагин ACC (JetBrains) сделал в этом проекте, - из его книги
 * `~/.amazing-claude-code/scenario-runs/<ключ проекта>/`, только на чтение. Ими, их очередью и
 * расписанием управляет ACC: IDE их показывает в истории, чтобы проект не начинался с пустого
 * места, но не пишет, не закрывает брошенными и не продолжает - иначе работа шла бы дважды.
 */
export class AccRuns {
  private readonly dir: string

  constructor(
    private readonly projectPath: string,
    accHome: string,
  ) {
    this.dir = join(accHome, 'scenario-runs', accProjectKey(projectPath))
  }

  async summaries(): Promise<RunSummary[]> {
    const entries = await readdir(this.dir, { withFileTypes: true }).catch(() => [])
    const read = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && isUsableId(entry.name))
        .map(async ({ name }) => {
          try {
            const raw = JSON.parse(await readFile(join(this.dir, name, SUMMARY), 'utf8')) as unknown

            return accSummary(raw, this.projectPath)
          } catch {
            return null
          }
        }),
    )

    return read.flatMap((summary) => (summary ? [summary] : []))
  }

  async read(id: string): Promise<ScenarioRun | null> {
    if (!isUsableId(id)) return null

    try {
      return accRun(
        JSON.parse(await readFile(join(this.dir, id, RECORD), 'utf8')) as unknown,
        this.projectPath,
      )
    } catch {
      return null
    }
  }
}

/** История проекта: свои прогоны и прогоны ACC, свежие сверху; тот же id - запись IDE. */
export const withAccRuns = (
  own: readonly RunSummary[],
  acc: readonly RunSummary[],
): RunSummary[] => {
  const ids = new Set(own.map((run) => run.id))

  return [...own, ...acc.filter((run) => !ids.has(run.id))].sort(
    (left, right) => right.startedAt - left.startedAt,
  )
}
