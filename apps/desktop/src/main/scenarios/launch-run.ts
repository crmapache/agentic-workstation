import { cardRuns, answersOf, isRunnable, missingInputs } from '@shared/scenario-rules'
import type { ScenarioRun } from '@shared/scenario-runs'
import { isRunFinished } from '@shared/scenario-runs'
import type { ScenarioCode, ScenarioScope } from '@shared/scenarios'

import type { ScenarioProvider } from '../providers/scenario-provider'
import type { RunDesk } from './run-desk'
import { carryOnPoint } from './engine/run-steps'
import { ScenarioEngine } from './engine/scenario-engine'

/** Что поднять: сценарий с полки, ответы, где работать и чей это элемент очереди. */
export type LaunchRequest = {
  id: string
  scope: ScenarioScope
  inputs: Record<string, string>
  /** Расписание, поднявшее прогон; пусто - человек. */
  from: string
  runId: string
  cwd: string
  queueId: string
  itemId: string
}

/** Подготовить провайдера и папки его транскриптов для папки прогона. */
const prepared = async (
  desk: RunDesk,
  provider: ScenarioProvider,
  cwd: string,
): Promise<{ code: ScenarioCode } | { dirs: string[] }> => {
  const code = await provider.prepare(desk.host.projectPath)

  return code ? { code } : { dirs: await provider.transcriptDirs(cwd) }
}

/** Движок не начался: запись - упавшей, место - свободным. */
const failedToBegin = async (desk: RunDesk, engine: ScenarioEngine, record: ScenarioRun) => {
  engine.abandon()
  await desk.keep(record.id, {
    ...record,
    state: 'failed',
    failure: 'crashed',
    finishedAt: Date.now(),
  })
  desk.release(record.id)
  desk.sendLive()
}

/**
 * Поднять прогон - одним кодом для очереди и расписания (launch в ACC). Запуск отклоняется
 * до подъёма процесса: сломанный сценарий, пустой обязательный ответ, нет CLI, нет доверия.
 */
export const launchRun = async (
  desk: RunDesk,
  provider: ScenarioProvider,
  request: LaunchRequest,
): Promise<ScenarioCode | null> => {
  if (desk.isClosing) return 'runBusy'

  const scenario = await desk.store.find(request.id, request.scope)

  if (!scenario) return 'scenarioGone'
  if (!isRunnable(scenario)) return 'scenarioBroken'
  if (missingInputs(scenario, request.inputs).length > 0) return 'scenarioMissingInput'

  const ready = await prepared(desk, provider, request.cwd)

  if ('code' in ready) return ready.code
  // Пока искали CLI, IDE начала закрываться: движок, поднятый после остановки, никто бы не погасил.
  if (desk.isClosing) return 'runBusy'

  const record: ScenarioRun = {
    id: request.runId,
    projectPath: desk.host.projectPath,
    cwd: request.cwd,
    provider: provider.id,
    queueId: request.queueId,
    itemId: request.itemId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scope: scenario.scope,
    snapshot: scenario,
    startedAt: Date.now(),
    finishedAt: 0,
    state: 'starting',
    runFrom: request.from,
    inputs: answersOf(scenario, request.inputs),
    total: cardRuns(scenario),
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
  }
  const engine = new ScenarioEngine(
    record,
    provider.accounts.current(),
    desk.engineHost(record.id, provider, request.cwd, ready.dirs),
  )

  // Место взято до единого процесса: движок ничего не поднимает до begin().
  desk.claim(record.id, engine)
  await desk.keep(record.id, record)
  desk.sendLive()

  try {
    engine.begin()
  } catch (error) {
    console.warn('[scenarios] прогон не начался:', error)
    await failedToBegin(desk, engine, record)
  }

  return null
}

/**
 * Подхватить остановленный или упавший прогон с места: тот же id, та же запись, та же папка.
 * Можно ли это очереди (за ним ничего не стартовало), решает сервис до вызова.
 */
export const carryOnRun = async (
  desk: RunDesk,
  provider: ScenarioProvider,
  runId: string,
): Promise<ScenarioCode | null> => {
  if (desk.live.has(runId)) return 'runBusy'

  const record = await desk.runs.read(runId)

  if (!record) return 'runGone'
  if (!isRunFinished(record.state)) return 'runBusy'
  if (!carryOnPoint(record)) return 'runNotResumable'

  const cwd = record.cwd || desk.host.projectPath
  const ready = await prepared(desk, provider, cwd)

  if ('code' in ready) return ready.code
  if (desk.isClosing) return 'runBusy'

  const engine = new ScenarioEngine(
    record,
    provider.accounts.current(),
    desk.engineHost(runId, provider, cwd, ready.dirs),
  )

  desk.claim(runId, engine)
  desk.sendLive()

  try {
    engine.carryOn()
  } catch (error) {
    console.warn('[scenarios] прогон не подхватился:', error)
    await failedToBegin(desk, engine, record)
  }

  // Сразу на диск: список читается с диска и иначе записал бы идущий прогон в прошлые.
  if (desk.live.has(runId)) await desk.keep(runId, engine.run)

  return null
}
