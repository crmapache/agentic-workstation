import type { IdeFeatures } from './ide-features'

/**
 * Службы возможностей IDE, которые нужны каналам окна (register-handlers.ts), - под их именами
 * там. Отдельно от запуска: список растёт с каждой возможностью, а index.ts держит лимит строк.
 */
export const featureServices = (features: IdeFeatures) => ({
  idePrefs: features.idePrefs,
  commitPush: features.commitPush,
  scenarios: features.scenarios,
  stats: features.statistics.stats,
  remote: features.remote,
  tasks: features.tasks,
  taskAuthor: features.taskAuthor,
  inbox: features.inbox,
  definitions: features.definitions,
  memorySaver: features.memorySaver,
  extensions: features.extensions,
  tracker: features.tracker,
  voice: features.voice,
})
