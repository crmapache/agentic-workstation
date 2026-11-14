import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

import { app, dialog } from 'electron'
import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from 'electron'

import type { WorkspaceState } from '@shared/workspace'

import type { WorkspaceService } from './workspace-service'

type DialogContext = {
  workspace: WorkspaceService
  getWindow: () => BrowserWindow | null
}

/**
 * Папка, от которой начинать выбор: рядом с активным проектом или «Документы». Рядом с домом
 * проектов нет - служебная папка IDE, от дома тоже «Документы».
 */
const startingFolder = (workspace: WorkspaceService) => {
  const { projects, activeProjectId } = workspace.getState()
  const active = projects.find((project) => project.id === activeProjectId)

  return active && !active.home ? dirname(active.rootPath) : app.getPath('documents')
}

const showOpen = (window: BrowserWindow | null, options: OpenDialogOptions) =>
  window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options)

const showSave = (window: BrowserWindow | null, options: SaveDialogOptions) =>
  window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options)

/** Системный выбор папки. Отмена - null. */
export const pickFolder = async (
  { getWindow }: DialogContext,
  defaultPath: string,
): Promise<string | null> => {
  const result = await showOpen(getWindow(), {
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  })

  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/**
 * Выбор папки и открытие её проектом. Общий для меню проекта в шапке и пункта меню
 * File → Open Project.
 */
export const pickAndOpenProject = async (context: DialogContext): Promise<WorkspaceState> => {
  const rootPath = await pickFolder(context, startingFolder(context.workspace))

  return rootPath ? context.workspace.openProject(rootPath) : context.workspace.getState()
}

/**
 * Новый проект: системный диалог «где и как назвать», пустая папка, открытие её
 * вкладкой. Шаблонов пока нет - проект начинается с пустой папки.
 */
export const createNewProject = async (context: DialogContext): Promise<WorkspaceState> => {
  const result = await showSave(context.getWindow(), {
    title: 'New Project',
    buttonLabel: 'Create',
    nameFieldLabel: 'Project name:',
    defaultPath: join(startingFolder(context.workspace), 'untitled'),
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  })

  if (result.canceled || !result.filePath) return context.workspace.getState()

  await mkdir(result.filePath, { recursive: true })

  return context.workspace.openProject(result.filePath)
}
