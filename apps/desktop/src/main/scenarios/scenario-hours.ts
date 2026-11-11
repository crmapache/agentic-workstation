import { isProviderId } from '@shared/providers'
import { answersOf, isRunnable, missingInputs } from '@shared/scenario-rules'
import type { ScenarioHourRequest } from '@shared/scenario-view'
import type { ScenarioCode, ScenarioSchedule } from '@shared/scenarios'
import { SCENARIO_REPEATS } from '@shared/scenarios'

import type { QueueRunner } from './queue-runner'
import type { RunDesk } from './run-desk'
import { scopeOf } from './store/scenario-parse'
import { armed, isDue, nextDue, isMissed } from './store/schedule-clock'

/**
 * Отложенные запуски (schedule / tickHours в ACC). Сценарий, который не запускается, на время
 * не ставится вовсе - об этом говорят сразу, пока человек смотрит на экран. Пропущенный час
 * не наверстывается. Созревший час поднимает новую очередь: в девять утра выбрать, в какую
 * очередь встать, некому, а у новой - свои worktree и провайдер, сохранённые в записи часа.
 */

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)))

export const scheduleHour = async (
  desk: RunDesk,
  hour: ScenarioHourRequest,
): Promise<ScenarioCode | null> => {
  const scenario = await desk.store.find(hour.scenarioId, scopeOf(hour.scope))

  if (!scenario) return 'scenarioGone'
  if (!isRunnable(scenario)) return 'scenarioBroken'
  if (missingInputs(scenario, hour.inputs).length > 0) return 'scenarioMissingInput'

  const wanted: ScenarioSchedule = {
    id: hour.scheduleId,
    scenarioId: scenario.id,
    scope: scenario.scope,
    at: clamp(hour.at, 0, 24 * 60 - 1),
    repeat: SCENARIO_REPEATS.find((repeat) => repeat === hour.repeat) ?? 'once',
    weekday: clamp(hour.weekday, 1, 7),
    inputs: answersOf(scenario, hour.inputs),
    nextAt: 0,
    lastAt: 0,
    missedAt: 0,
    worktree: hour.worktree,
    provider: isProviderId(hour.provider) ? hour.provider : 'claude',
  }
  const stored = await desk.schedules.put({ ...wanted, nextAt: nextDue(wanted, Date.now()) })

  return stored ? null : 'schedulesNotWritten'
}

export const unscheduleHour = async (
  desk: RunDesk,
  scheduleId: string,
): Promise<ScenarioCode | null> =>
  (await desk.schedules.remove(scheduleId)) ? null : 'schedulesNotWritten'

/**
 * Удар часов: созревшие часы занимаются в файле (CAS по сроку) и поднимаются. Пропущенный -
 * только отмечается. Прогон по этой же записи ещё идёт - это пропуск, а не вторая очередь:
 * ежедневный будильник копил бы по очереди в день. true - что-то поменялось.
 */
export const tickHours = async (desk: RunDesk, runner: QueueRunner): Promise<boolean> => {
  const now = Date.now()
  const hours = (await desk.schedules.stored()) ?? []
  let moved = false

  for (const hour of hours) {
    const due = hour.nextAt
    const ripe = isDue(hour, now)

    if (!ripe && !isMissed(hour, now)) continue
    if (!(await desk.schedules.claim(hour.id, due, armed(hour, now)))) continue

    moved = true

    // Тот же час ещё идёт - пропуск. Час без worktree, а в папке проекта уже работает очередь, -
    // тоже пропуск: два агента без присмотра правили бы одно рабочее дерево.
    const busy =
      [...desk.live.values()].some((holder) => holder.engine.run.runFrom === hour.id) ||
      (!hour.worktree && runner.folderBusy(desk.host.projectPath))
    const started =
      ripe && !busy
        ? await runner.start(
            {
              projectPath: desk.host.projectPath,
              scenarioId: hour.scenarioId,
              scope: hour.scope,
              inputs: hour.inputs,
              provider: hour.provider,
              target: { kind: 'new', worktree: hour.worktree },
              afterSuccess: true,
            },
            hour.id,
          )
        : null
    const refused = started?.ok ? runner.refusalOf(started.queueId, started.itemId) : null

    // Сценарий не стартовал (нет CLI, нет доверия) - час не сработал, а его пустая очередь и
    // worktree не копятся по одной на каждое утро.
    if (started?.ok && refused) await runner.act(started.queueId, { kind: 'close' })

    await desk.schedules.settle(hour.id, due, now, started?.ok === true && !refused)
  }

  return moved
}
