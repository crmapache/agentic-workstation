import { stat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { count, anyText, handlerOf, HostArgError, optionalText } from './host-args'
import type { HostMethod } from './host-types'
import { projectOf, projectFile } from './project-files'

/** Сколько расширение читает и пишет за раз и сколько строк папки видит. */
const READ_MAX_BYTES = 5 * 1024 * 1024
const WRITE_MAX_CHARS = 5 * 1024 * 1024
const LIST_MAX = 2000
const EDITOR_TEXT_MAX = 1024 * 1024

/** Файлы и редактор: чтение - files.read, запись и правка текста - files.write (ADR 0091). */
export const FILES_METHODS: Record<string, HostMethod> = {
  'files.read': {
    permission: 'files.read',
    run: async (call) => {
      const { absolute } = await projectFile(call)
      const info = await stat(absolute).catch(() => null)

      if (!info?.isFile()) throw new HostArgError('The file does not exist.')
      if (info.size > READ_MAX_BYTES) throw new HostArgError('The file is larger than 5 MB.')

      return readFile(absolute, 'utf8')
    },
  },
  'files.exists': {
    permission: 'files.read',
    run: async (call) => {
      const { absolute } = await projectFile(call)

      return (await stat(absolute).catch(() => null)) !== null
    },
  },
  'files.list': {
    permission: 'files.read',
    run: async (call) => {
      const { absolute, relative } = await projectFile(call, { allowRoot: true })
      const entries = await readdir(absolute, { withFileTypes: true }).catch(() => {
        throw new HostArgError('The folder does not exist.')
      })

      return entries.slice(0, LIST_MAX).map((entry) => ({
        name: entry.name,
        path: relative ? `${relative}/${entry.name}` : entry.name,
        directory: entry.isDirectory(),
      }))
    },
  },
  'files.write': {
    permission: 'files.write',
    run: async (call) => {
      const { absolute } = await projectFile(call)
      const content = anyText(call.args, 'text', WRITE_MAX_CHARS)
      const info = await stat(absolute).catch(() => null)

      if (info?.isDirectory()) throw new HostArgError('The path is a folder.')

      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, content, 'utf8')
    },
  },
  'files.delete': {
    permission: 'files.write',
    run: async (call) => {
      const { absolute } = await projectFile(call)
      const info = await stat(absolute).catch(() => null)

      if (!info?.isFile()) throw new HostArgError('Only an existing file can be deleted.')

      await call.context.trash(absolute)
    },
  },
  'files.watchSaves': {
    permission: 'files.read',
    run: (call) => {
      call.runtime.hooks.set(handlerOf(call.args), 'fileSaved')
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'editor.active': {
    permission: 'files.read',
    run: (call) => call.context.editor({ op: 'active' }),
  },
  'editor.insert': {
    permission: 'files.write',
    run: (call) =>
      call.context.editor({ op: 'insert', text: anyText(call.args, 'text', EDITOR_TEXT_MAX) }),
  },
  'editor.replaceSelection': {
    permission: 'files.write',
    run: (call) =>
      call.context.editor({
        op: 'replaceSelection',
        text: anyText(call.args, 'text', EDITOR_TEXT_MAX),
      }),
  },
  // Открыть файл человеку на виду - без прав: расширение ничего не узнаёт.
  'editor.open': {
    permission: null,
    run: async (call) => {
      const project = optionalText(call.args, 'project', 4000) === null ? null : projectOf(call)
      const { project: owner, relative } = await projectFile(call)

      return call.context.editor({
        op: 'open',
        projectPath: (project ?? owner).path,
        path: relative,
        line: count(call.args, 'line', { min: 1, max: 10_000_000, fallback: 1 }),
      })
    },
  },
}
