import { it, expect, describe } from 'vitest'

import { scheduledName } from './ScenariosScreen.utils'

describe('полки проекта', () => {
  it('имя отложенного запуска - по полке и id; ушёл с полки - null', () => {
    const shelves = {
      scenarios: [
        { id: 'tidy', scope: 'project' as const, name: 'Tidy up', inputs: [] },
        { id: 'tidy', scope: 'user' as const, name: 'My tidy', inputs: [] },
      ],
    }

    expect(scheduledName(shelves, { scope: 'user', scenarioId: 'tidy' })).toBe('My tidy')
    expect(scheduledName(shelves, { scope: 'project', scenarioId: 'gone' })).toBeNull()
  })
})
