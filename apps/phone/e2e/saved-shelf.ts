import type { Scenario } from '@shared/scenarios'

import type { ScenariosPort } from '../../desktop/src/main/remote/bridge/bridge-ports'

/**
 * Полки подделки IDE помнят сохранённое, как ScenarioService: черновик модели, сохранённый с
 * телефона, ложится на полку и открывается по id. Подделка фикстуры его не помнит, а телефону
 * после сохранения надо куда-то прийти - на экран сценария и на полку.
 */
export const withSavedScenarios = (port: ScenariosPort): ScenariosPort => {
  const saved: Scenario[] = []

  return {
    ...port,
    save: async (projectPath, scenario, scope) => {
      const outcome = await port.save(projectPath, scenario, scope)

      if (outcome.ok) saved.push(outcome.scenario)

      return outcome
    },
    fetch: async (projectPath, id, scope) =>
      (await port.fetch(projectPath, id, scope)) ??
      saved.find((one) => one.id === id && one.scope === scope) ??
      null,
    shelves: async (projectPath) => {
      const view = await port.shelves(projectPath)

      return { ...view, scenarios: [...view.scenarios, ...saved] }
    },
  }
}
