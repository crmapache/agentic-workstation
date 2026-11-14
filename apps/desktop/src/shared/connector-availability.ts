/**
 * В каких проектах коннектор виден провайдеру. all - во всех, новые проекты получают его
 * сами; only - только в перечисленных. Исключений у «во всех» нет: «все» значит все, а
 * выбор по одному - режим only. remembered у «во всех» - отмеченные проекты, к которым вернёт
 * переключатель (ADR 0054); на видимость они не влияют. Проект - путь к его корню.
 */
export type ConnectorAvailability =
  { mode: 'all'; remembered?: string[] | undefined } | { mode: 'only'; projects: string[] }

/** Коннектор, видный только в отмеченных проектах: им одним есть что выбирать по одному. */
export type SelectedProjects = Extract<ConnectorAvailability, { mode: 'only' }>

export const EVERYWHERE: ConnectorAvailability = { mode: 'all' }

export const isAvailableIn = (availability: ConnectorAvailability, projectPath: string): boolean =>
  availability.mode === 'all' || availability.projects.includes(projectPath)

/** Отметить проект или снять отметку, не трогая остальные. */
export const withProject = (
  availability: SelectedProjects,
  projectPath: string,
  enabled: boolean,
): SelectedProjects => {
  const without = availability.projects.filter((path) => path !== projectPath)

  return { mode: 'only', projects: enabled ? [...without, projectPath] : without }
}

/** Проекты, о которых помнит доступность: у «во всех» таких нет. */
export const projectsIn = (availability: ConnectorAvailability): readonly string[] =>
  availability.mode === 'all' ? [] : availability.projects

/**
 * Забыть проект в доступности: его папку переименовали или удалили, и запись о нём больше
 * ни на что не влияет, а только путает подпись «только в N».
 */
export const forgetProject = (
  availability: ConnectorAvailability,
  projectPath: string,
): ConnectorAvailability =>
  availability.mode === 'all'
    ? availability
    : { mode: 'only', projects: availability.projects.filter((path) => path !== projectPath) }

/**
 * Перенести настройку проекта на другой путь: папку переименовали или перенесли, и
 * «только здесь» должно пойти за ней, а не остаться на старом пути.
 */
export const moveProject = (
  availability: ConnectorAvailability,
  from: string,
  to: string,
): ConnectorAvailability => {
  if (availability.mode === 'all' || !availability.projects.includes(from)) return availability

  return {
    mode: 'only',
    projects: [...new Set(availability.projects.map((path) => (path === from ? to : path)))],
  }
}

/**
 * Сменить режим (ADR 0054). «Во всех» - все, без исключений, а отмеченные проекты
 * запоминаются. «Только» возвращает отмеченные в прошлый раз; в первый раз не отмечено ничего:
 * где коннектор нужен, человек выбирает сам, а не снимает лишнее со всех.
 */
export const withMode = (
  availability: ConnectorAvailability,
  mode: ConnectorAvailability['mode'],
): ConnectorAvailability => {
  if (availability.mode === mode) return availability

  if (availability.mode === 'only') {
    return availability.projects.length
      ? { mode: 'all', remembered: [...availability.projects] }
      : EVERYWHERE
  }

  return { mode: 'only', projects: [...(availability.remembered ?? [])] }
}
