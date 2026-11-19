import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

import { stringArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { findProject, knownProjects } from './workstation-args'

const isFolder = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** Проекты IDE: какие есть и открыть папку вкладкой. */
export const PROJECT_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'list_projects',
    description:
      'Projects of the IDE: open ones (tabs, one of them active) and recently closed ones, with folder paths. Other tools take a project by this path or name.',
    access: 'read',
    inputSchema: { type: 'object', properties: {} },
    run: (_args, ports, call) => {
      const state = ports.projects.state()
      const open = state.projects.map((project) => ({
        name: project.name,
        path: project.rootPath,
        open: true,
        active: project.id === state.activeProjectId,
        ...(project.home && { home: true }),
      }))
      const recent = state.recentProjects.map((project) => ({
        name: project.name,
        path: project.rootPath,
        open: false,
      }))

      return Promise.resolve({
        projects: [...open, ...recent],
        thisProject: call.launch?.projectPath || null,
      })
    },
  },
  {
    name: 'open_project',
    description:
      'Open a folder as a project tab of the IDE and make it the active tab (the person sees it switch). An open project only becomes active.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Absolute folder path, or a name from list_projects.',
        },
      },
      required: ['project'],
    },
    run: async (args, ports) => {
      const named = stringArg(args, 'project', true)
      // Не путь - имя известного проекта; два с одним именем - отказ, а не первый попавшийся.
      const path = isAbsolute(named) ? named : findProject(knownProjects(ports.projects), named)

      if (!isAbsolute(path) || !(await isFolder(path))) {
        throw new ArgumentError(`${named} is not a folder on this computer.`)
      }

      const state = await ports.projects.open(path)

      return { opened: path, openProjects: state.projects.map((project) => project.rootPath) }
    },
  },
]
