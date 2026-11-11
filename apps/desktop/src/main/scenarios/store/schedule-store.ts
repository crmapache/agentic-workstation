import { createHash } from 'node:crypto'

import type { Scenario, ScenarioSchedule } from '@shared/scenarios'
import { isProviderId } from '@shared/providers'
import { SCENARIO_REPEATS } from '@shared/scenarios'

import type { LockedFile } from './locked-file'
import { freshId } from './scenario-parse'
import { claimHour, settleHour, putSchedule, keepSchedules } from './schedule-clock'

const isRaw = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const scheduleOf = (raw: Record<string, unknown>): ScenarioSchedule => {
  const stored = raw as Partial<ScenarioSchedule>

  return {
    id: '',
    scenarioId: '',
    at: 0,
    weekday: 1,
    inputs: {},
    nextAt: 0,
    lastAt: 0,
    missedAt: 0,
    ...stored,
    worktree: stored.worktree === true,
    provider: isProviderId(stored.provider) ? stored.provider : 'claude',
    scope: stored.scope === 'user' ? 'user' : 'project',
    repeat: SCENARIO_REPEATS.find((repeat) => repeat === stored.repeat) ?? 'once',
  }
}

/**
 * id записи без него - хешем от полей, а не случайный: файл читают независимо, и случайные id
 * дали бы каждому читателю свои.
 */
const identify = (list: ScenarioSchedule[]): ScenarioSchedule[] => {
  const taken = new Set(list.map((one) => one.id).filter(Boolean))

  return list.map((one) => {
    if (one.id) return one

    const seed = [one.scenarioId, one.scope, one.at, one.repeat, one.weekday].join(' ')
    let id = ''

    for (let attempt = 0; !id || taken.has(id); attempt += 1) {
      id = createHash('sha256')
        .update(attempt === 0 ? seed : `${seed} ${attempt}`)
        .digest('hex')
        .slice(0, 16)
    }

    taken.add(id)

    return { ...one, id }
  })
}

/**
 * Отложенные запуски проекта на машине (ScheduleStore в ACC), а не в файле сценария: «в
 * девять, на моей машине» - договор человека со своим утром. Час занимается в файле под
 * замком до запуска, итог пишется накладыванием на перечитанное.
 */
export class ScheduleStore {
  constructor(private readonly file: LockedFile) {}

  /** Список; null - файл не прочитался (это не «расписаний нет»). */
  stored(): Promise<ScenarioSchedule[] | null> {
    return this.file.underLock(() => this.read())
  }

  put(schedule: ScenarioSchedule): Promise<boolean> {
    return this.edited((list) => putSchedule(list, schedule, freshId))
  }

  remove(id: string): Promise<boolean> {
    return this.edited((list) => (id ? list.filter((one) => one.id !== id) : list))
  }

  keepOnly(project: Scenario[] | null, user: Scenario[] | null) {
    return this.changed((list) => keepSchedules(list, project, user))
  }

  /** Занять час, если срок прежний; null - его взял другой взгляд часов или другая IDE. */
  claim(id: string, expected: number, next: ScenarioSchedule) {
    return this.file.underLock(async () => {
      const current = await this.read()
      const claimed = current && claimHour(current, id, expected, next)

      return claimed && (await this.write(claimed)) ? claimed : null
    })
  }

  settle(id: string, due: number, firedAt: number, ran: boolean) {
    return this.changed((list) => settleHour(list, id, due, firedAt, ran))
  }

  private changed(edit: (list: ScenarioSchedule[]) => ScenarioSchedule[]) {
    return this.file.underLock(async () => {
      const current = await this.read()

      if (!current) return null

      const wanted = edit(current)

      return sameList(wanted, current) || !(await this.write(wanted)) ? current : wanted
    })
  }

  private edited(edit: (list: ScenarioSchedule[]) => ScenarioSchedule[]): Promise<boolean> {
    return this.file.underLock(async () => {
      const current = await this.read()

      if (!current) return false

      const wanted = edit(current)

      return sameList(wanted, current) || (await this.write(wanted))
    })
  }

  private async read(): Promise<ScenarioSchedule[] | null> {
    const stored = await this.file.read()

    if (stored.kind === 'missing') return []
    if (stored.kind === 'unreadable') return null

    try {
      const value = JSON.parse(stored.text) as unknown

      if (!Array.isArray(value)) return null

      const list = value.filter(isRaw).map(scheduleOf)
      const named = identify(list)

      // Проставленные имена тут же на диск: посчитанное имя зависит от места среди близнецов.
      if (named.some((one, at) => one !== list[at])) await this.write(named)

      return named
    } catch {
      return null
    }
  }

  private write(list: ScenarioSchedule[]): Promise<boolean> {
    return this.file.put(JSON.stringify(list))
  }
}

const sameList = (left: ScenarioSchedule[], right: ScenarioSchedule[]): boolean =>
  left.length === right.length && left.every((one, at) => one === right[at])
