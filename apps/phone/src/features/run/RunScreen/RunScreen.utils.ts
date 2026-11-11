import type { RunWire, RunStepWire } from '@agentic-workstation/remote-protocol/wire-types'

/** Этапы прогона с их шагами по порядку снимка сценария; шаг без этапа - в конце, своим. */
export const stagesOf = (run: RunWire): { id: string; title: string; steps: RunStepWire[] }[] => {
  const stages = run.stages.map((stage) => ({
    ...stage,
    steps: run.steps.filter((step) => step.stageId === stage.id),
  }))
  const known = new Set(run.stages.map((stage) => stage.id))
  const stray = run.steps.filter((step) => !known.has(step.stageId))

  return stray.length > 0 ? [...stages, { id: '', title: '', steps: stray }] : stages
}

/** Что сказать о шаге при раскрытии: провал, ошибка, вердикт головы, итог или последние слова. */
export const stepWords = (step: RunStepWire): string =>
  [step.failure, step.error, step.verdict, step.summary || step.said].filter(Boolean).join('\n\n')
