import { homedir } from 'node:os'

import { app } from 'electron'
import type { BrowserWindow } from 'electron'

import { readDirectory } from '../fs/directory-reader'
import { cloneRepository } from '../git/git-clone'
import { readResourceUsage } from '../usage/resource-usage'
import { pickFolder, createNewProject, pickAndOpenProject } from '../workspace/project-dialogs'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'

export type HandlerContext = {
  workspace: WorkspaceService
  getWindow: () => BrowserWindow | null
}

type WorkspaceChannels =
  | 'app:getInfo'
  | 'app:getResourceUsage'
  | 'dialog:pickFolder'
  | 'workspace:get'
  | 'workspace:openProject'
  | 'workspace:newProject'
  | 'workspace:openRecentProject'
  | 'workspace:cloneProject'
  | 'workspace:closeProject'
  | 'workspace:activateProject'
  | 'workspace:moveProject'
  | 'fs:readDirectory'

/** Корень открытого проекта по id из окна. Неизвестный id - ошибка, не догадка. */
export const projectRootOf = (workspace: WorkspaceService, projectId: unknown) => {
  assertString(projectId, 'projectId')

  const project = workspace.findProject(projectId)

  if (!project) throw new Error(`Проект ${projectId} не открыт`)

  return project.rootPath
}

/** Каналы приложения, проектов и файлов. Логика - в сервисах, здесь только связка. */
export const createWorkspaceHandlers = (
  context: HandlerContext,
): Pick<InvokeHandlers, WorkspaceChannels> => {
  const { workspace } = context

  return {
    'app:getInfo': () => ({
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      homeDir: homedir(),
      documentsDir: app.getPath('documents'),
    }),
    'app:getResourceUsage': () => readResourceUsage(),

    'dialog:pickFolder': ({ defaultPath }) => {
      assertString(defaultPath, 'defaultPath')

      return pickFolder(context, defaultPath)
    },

    'workspace:get': () => workspace.getState(),
    'workspace:openProject': () => pickAndOpenProject(context),
    'workspace:newProject': () => createNewProject(context),
    'workspace:openRecentProject': ({ rootPath }) => {
      assertString(rootPath, 'rootPath')

      return workspace.openRecentProject(rootPath)
    },
    'workspace:cloneProject': async ({ url, parentPath }) => {
      assertString(url, 'url')
      assertString(parentPath, 'parentPath')

      const result = await cloneRepository(url, parentPath)

      return result.ok ? { ok: true, state: await workspace.openProject(result.rootPath) } : result
    },
    'workspace:closeProject': ({ projectId }) => {
      assertString(projectId, 'projectId')

      return workspace.closeProject(projectId)
    },
    'workspace:activateProject': ({ projectId }) => {
      assertString(projectId, 'projectId')

      return workspace.activateProject(projectId)
    },
    'workspace:moveProject': ({ projectId, beforeId }) => {
      assertString(projectId, 'projectId')
      if (beforeId !== null) assertString(beforeId, 'beforeId')

      return workspace.moveProject(projectId, beforeId)
    },

    'fs:readDirectory': ({ projectId, relativePath }) => {
      assertString(relativePath, 'relativePath')

      return readDirectory(projectRootOf(workspace, projectId), relativePath)
    },
  }
}
