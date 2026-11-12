import type { ScenarioSchedule } from '@shared/scenarios'

import type { ScenariosPort } from '../bridge/bridge-ports'
import { stepLogOf, scheduleOf } from './fake-extras'
import type { ExtrasIde } from './fake-ports'

type ShelfPort = Pick<
  ScenariosPort,
  | 'fetch'
  | 'duplicate'
  | 'delete'
  | 'draft'
  | 'cancelDraft'
  | 'save'
  | 'log'
  | 'starRun'
  | 'deleteRun'
  | 'schedule'
  | 'unschedule'
>

/** Полки, журнал шага и расписание - как ScenarioService и ScenarioShelves. */
export const shelfPortOf = (ide: ExtrasIde, schedules: ScenarioSchedule[]): ShelfPort => {
  const log = stepLogOf(ide.projectPath)
  const transcript = log.splice(0, 2)

  return {
    fetch: (path, id, scope) =>
      Promise.resolve(id === ide.scenario.id && scope === ide.scenario.scope ? ide.scenario : null),
    duplicate: (path, id, scope) =>
      Promise.resolve(ide.record('scenarios.duplicate', path, id, scope)),
    delete: (path, id, scope) => Promise.resolve(ide.record('scenarios.delete', path, id, scope)),
    draft: (path, draftId, description, scope) => {
      ide.record('scenarios.draft', path, draftId, description, scope)

      return Promise.resolve(
        description.startsWith('fail')
          ? { ok: false, error: `CLI failed in ${ide.projectPath}`, cancelled: false }
          : { ok: true, scenario: { ...ide.scenario, id: 'drafted', name: 'Drafted', scope } },
      )
    },
    cancelDraft: (draftId) => void ide.record('scenarios.cancelDraft', draftId),
    save: (path, scenario, scope) => {
      ide.record('scenarios.save', path, scenario, scope)

      return Promise.resolve({ ok: true, scenario: { ...scenario, scope } })
    },
    // Как StepLogs.page: earlier подгружает транскрипт выше в ленту журнала.
    log: (path, runId, key, earlier) => {
      ide.record('scenarios.log', path, runId, key, earlier)

      if (key !== 'head') return Promise.resolve({ found: false, feed: null })
      if (earlier) log.unshift(...transcript.splice(0))

      return Promise.resolve({
        found: true,
        feed: {
          conversationId: 'head',
          items: [...log],
          tasks: [],
          hasEarlier: transcript.length > 0,
        },
      })
    },
    starRun: (path, runId, starred) =>
      Promise.resolve(ide.record('scenarios.starRun', path, runId, starred)),
    deleteRun: (path, runId) => Promise.resolve(ide.record('scenarios.deleteRun', path, runId)),
    schedule: (path, hour) => {
      ide.record('scenarios.schedule', path, hour)
      schedules.push(scheduleOf(hour))

      return Promise.resolve(null)
    },
    unschedule: (path, id) => {
      ide.record('scenarios.unschedule', path, id)
      schedules.splice(0, schedules.length, ...schedules.filter((one) => one.id !== id))

      return Promise.resolve(null)
    },
  }
}
