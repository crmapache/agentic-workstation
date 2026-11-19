import { realpath } from 'node:fs/promises'
import { sep, dirname, resolve, relative, isAbsolute } from 'node:path'

import { text, HostArgError, optionalText } from './host-args'
import type { HostCall, ProjectView } from './host-types'

/** Проект вызова: по пути или имени из открытых, иначе - открытый сейчас. */
export const projectOf = (call: HostCall): ProjectView => {
  const projects = call.context.projects()
  const wanted = optionalText(call.args, 'project', 4000)

  if (wanted === null) {
    const active = projects.find((project) => project.active)

    if (!active) throw new HostArgError('No project is open.')

    return active
  }

  const matches = projects.filter((project) => project.path === wanted || project.name === wanted)

  if (matches.length === 1 && matches[0]) return matches[0]
  if (matches.length > 1)
    throw new HostArgError(`Several open projects are named "${wanted}": pass the path.`)

  throw new HostArgError(`"${wanted}" is not an open project.`)
}

const inside = (root: string, path: string): boolean => {
  const fromRoot = relative(root, path)

  return (
    fromRoot === '' ||
    (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot))
  )
}

/**
 * Путь файла для расширения - только внутри открытого проекта, и по настоящему пути: ссылка из
 * проекта на ~/.ssh наружу не выведет. Путь - от корня проекта или абсолютный внутри него.
 * Нового файла ещё нет - проверяется ближайшая существующая папка над ним.
 */
export const projectFile = async (
  call: HostCall,
  options: { allowRoot?: boolean } = {},
): Promise<{ project: ProjectView; absolute: string; relative: string }> => {
  const raw = options.allowRoot
    ? (optionalText(call.args, 'path', 4000) ?? '')
    : text(call.args, 'path', 4000)
  const absoluteWanted = isAbsolute(raw)
  const project = absoluteWanted
    ? call.context.projects().find((candidate) => inside(candidate.path, resolve(raw)))
    : projectOf(call)

  if (!project) throw new HostArgError(`"${raw}" is not inside an open project.`)

  const absolute = resolve(project.path, raw)

  if (!inside(project.path, absolute) || (!options.allowRoot && absolute === project.path)) {
    throw new HostArgError(`"${raw}" is outside the project.`)
  }

  const root = await realpath(project.path)
  let probe = absolute

  for (;;) {
    const real = await realpath(probe).catch(() => null)

    if (real !== null) {
      if (!inside(root, real)) throw new HostArgError(`"${raw}" leads outside the project.`)

      break
    }

    const parent = dirname(probe)

    if (parent === probe) throw new HostArgError(`"${raw}" is outside the project.`)

    probe = parent
  }

  return { project, absolute, relative: relative(project.path, absolute).split(sep).join('/') }
}
