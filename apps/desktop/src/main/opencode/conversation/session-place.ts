import { resolve } from 'node:path'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Сессия OpenCode этой папки проекта. OpenCode ведёт запросы по id сессии в её собственной
 * папке (`location.directory`), поэтому чужая сессия, открытая в проекте, работала бы в
 * другой папке, мимо доверия и коннекторов этого проекта.
 */
export const isSessionOf = (session: unknown, projectPath: string): boolean => {
  const location = isRecord(session) && isRecord(session['location']) ? session['location'] : {}
  const directory = location['directory']

  return typeof directory === 'string' && resolve(directory) === resolve(projectPath)
}
