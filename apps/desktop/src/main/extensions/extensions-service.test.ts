import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { ExtensionsState } from '@shared/extensions'

import { JsonFile } from '../storage/json-file'
import { ExtensionStorage } from './extension-storage'
import { ExtensionsService } from './extensions-service'
import type { IdeLink } from './extensions-service.types'
import { ExtensionsStore } from './extensions-store'
import type { StoredExtensions } from './extensions-store'
import { WindowAsks } from './window-asks'
import { inlinePort, ExtensionEngine } from './engine/extension-engine'
import type { ExtensionNotice } from './host/host-types'

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

describe('ExtensionsService', () => {
  let dir = ''
  let service: ExtensionsService
  let state: ExtensionsState | null = null
  const notices: ExtensionNotice[] = []
  const secrets = new Map<string, string>()

  const ide = (project: string): IdeLink => ({
    projects: () => [{ path: project, name: 'demo', home: false, active: true }],
    notify: (_runtime, notice) => notices.push(notice),
    openUrl: () => Promise.resolve(),
    clipboard: { read: () => Promise.resolve('clip'), write: () => Promise.resolve() },
    workstation: { tools: () => [], call: () => Promise.resolve(null) },
    fetch: () => Promise.resolve({ status: 200, ok: true, headers: {}, body: 'pong' }),
    run: () => Promise.resolve({ code: 0, stdout: '', stderr: '' }),
    trash: async (path) => rm(path, { recursive: true, force: true }),
  })

  const extension = async (id: string, manifest: Record<string, unknown>, main: string) => {
    await mkdir(join(dir, 'extensions', id), { recursive: true })
    await writeFile(
      join(dir, 'extensions', id, 'extension.json'),
      JSON.stringify({ id, name: id, version: '1.0.0', apiVersion: 1, ...manifest }),
    )
    await writeFile(join(dir, 'extensions', id, 'main.js'), main)
  }

  const info = (id: string) => service.state().extensions.find((item) => item.id === id)

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'extensions-'))
    await mkdir(join(dir, 'project'))
    await writeFile(join(dir, 'project', 'notes.md'), 'hello')
    notices.length = 0
    secrets.clear()

    service = new ExtensionsService({
      root: join(dir, 'extensions'),
      store: await ExtensionsStore.load(
        new JsonFile<StoredExtensions>(join(dir, 'extensions.json')),
      ),
      storage: new ExtensionStorage(join(dir, 'data')),
      secrets: {
        get: (key) => secrets.get(key) ?? null,
        set: (key, value) => {
          if (value === null) secrets.delete(key)
          else secrets.set(key, value)

          return Promise.resolve()
        },
        forgetPrefix: (prefix) => {
          for (const key of [...secrets.keys()]) if (key.startsWith(prefix)) secrets.delete(key)

          return Promise.resolve()
        },
      },
      engine: (events) => new ExtensionEngine(inlinePort(), events),
      ide: ide(join(dir, 'project')),
      asks: new WindowAsks({
        dialog: () => undefined,
        dialogClosed: () => undefined,
        editorAsk: () => undefined,
      }),
      events: {
        changed: (next) => {
          state = next
        },
        view: () => undefined,
        logged: () => undefined,
        showView: () => undefined,
        toolsChanged: () => undefined,
      },
    })
  })

  afterEach(async () => {
    await service.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('запускает расширение без прав: команда, вид, строка состояния, уведомление', async () => {
    await extension(
      'hello',
      {},
      `export async function activate(ide) {
        await ide.commands.register('greet', { title: 'Greet', keys: 'cmd+alt+g' }, async () => {
          await ide.ui.notify({ title: 'Hi!' })
          return 'done'
        })
        const view = ide.ui.view({ id: 'main', title: 'Hello', icon: 'Smile' })
        await view.render({ type: 'text', text: 'Hello view' })
        await ide.ui.statusItem({ id: 'clock', text: '12:00', command: 'greet' })
      }`,
    )
    await service.start()

    expect(info('hello')?.status).toBe('running')
    expect(info('hello')?.contributions.commands).toEqual([
      { key: 'hello.greet', title: 'Greet', keys: 'cmd+alt+g' },
    ])
    expect(service.views()).toEqual([
      { key: 'hello.main', tree: { type: 'text', text: 'Hello view' }, revision: 1 },
    ])
    expect(info('hello')?.contributions.statusItems[0]?.command).toBe('hello.greet')

    await expect(service.runCommand('hello.greet')).resolves.toBe('done')
    expect(notices).toEqual([{ title: 'Hi!', body: '', tone: 'info', link: null }])
    expect(state?.extensions[0]?.id).toBe('hello')
  })

  it('просит права - ждёт одобрения; без права ручка отказывает словами автору', async () => {
    await extension(
      'reader',
      { permissions: ['files.read'] },
      `export async function activate(ide) {
        await ide.commands.register('read', 'Read', () => ide.files.read('notes.md'))
        await ide.commands.register('write', 'Write', () => ide.files.write('notes.md', 'changed'))
      }`,
    )
    await service.start()

    expect(info('reader')?.status).toBe('needsApproval')
    expect(info('reader')?.missing.permissions).toEqual(['files.read'])

    await service.approve('reader')

    expect(info('reader')?.status).toBe('running')
    await expect(service.runCommand('reader.read')).resolves.toBe('hello')
    await expect(service.runCommand('reader.write')).rejects.toThrow(/files\.write/)
  })

  it('не выпускает чтение файлов за проект', async () => {
    await extension(
      'escape',
      { permissions: ['files.read'] },
      `export async function activate(ide) {
        await ide.commands.register('peek', 'Peek', () => ide.files.read('../secret.txt'))
      }`,
    )
    await writeFile(join(dir, 'secret.txt'), 'nope')
    await service.start()
    await service.approve('escape')

    await expect(service.runCommand('escape.peek')).rejects.toThrow(/outside the project/)
  })

  it('хуки разговоров: переписать, отказать, узнать о конце хода', async () => {
    await extension(
      'guard',
      { permissions: ['agent.intercept', 'agent.observe'] },
      `let ended = null
      export async function activate(ide) {
        await ide.agent.onBeforeSend((message) => message.text + '\\n\\n(be brief)')
        await ide.agent.guard((request) => request.toolName === 'Bash' && request.input.command.includes('push --force') ? { deny: 'No force push here.' } : undefined)
        await ide.agent.onTurnEnd((turn) => { ended = turn.answer })
        await ide.commands.register('last', 'Last', () => ended)
      }`,
    )
    await service.start()
    await service.approve('guard')

    const base = { conversationId: 'c1', provider: 'claude' as const, projectPath: '/p' }

    expect(service.hooks.rewriting()).toBe(true)
    await expect(service.hooks.beforeSend({ ...base, text: 'Fix it' })).resolves.toBe(
      'Fix it\n\n(be brief)',
    )
    await expect(
      service.hooks.guard({
        ...base,
        toolName: 'Bash',
        action: { kind: 'command', command: 'git push --force', description: '' },
        input: { command: 'git push --force' },
        description: '',
      }),
    ).resolves.toBe('No force push here.')

    service.hooks.turnEnded({
      ...base,
      outcome: 'done',
      answer: 'All fixed.',
      changedFiles: [],
      durationMs: 1,
      costUsd: null,
    })
    await settle()
    await expect(service.runCommand('guard.last')).resolves.toBe('All fixed.')
  })

  it('инструменты для ИИ: имя с id расширения, вызов с проектом вызывающего', async () => {
    await extension(
      'word-count',
      { permissions: ['ai.tools'] },
      `export async function activate(ide) {
        await ide.tools.register({
          name: 'count_words',
          description: 'Count words in a text',
          inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
          readOnly: true,
        }, (args, caller) => ({ words: args.text.split(/\\s+/).length, project: caller.projectPath }))
      }`,
    )
    await service.start()
    await service.approve('word-count')

    expect(service.tools().map((tool) => tool.name)).toEqual(['word_count_count_words'])
    await expect(
      service.callTool(
        'word_count_count_words',
        { text: 'one two three' },
        { projectPath: '/p', conversationId: null },
      ),
    ).resolves.toBe('{"words":3,"project":"/p"}')
  })

  it('вечный цикл в команде - расширение падает с причиной, IDE живёт', async () => {
    await extension(
      'spin',
      {},
      `export async function activate(ide) { await ide.commands.register('spin', 'Spin', () => { while (true) {} }) }`,
    )
    await service.start()

    await expect(service.runCommand('spin.spin')).rejects.toThrow(/longer than 1 second/)
    expect(info('spin')?.status).toBe('failed')
    expect(info('spin')?.problem?.code).toBe('timeout')
    expect(info('spin')?.contributions.commands).toEqual([])
  })

  it('настройки: значение и секрет, расширение видит их, окно - только «задан ли секрет»', async () => {
    await extension(
      'configured',
      {
        settings: [
          { key: 'greeting', type: 'text', label: 'Greeting', default: 'Hi' },
          { key: 'token', type: 'secret', label: 'Token' },
        ],
      },
      `export async function activate(ide) { await ide.commands.register('all', 'All', () => ide.settings.all()) }`,
    )
    await service.start()
    await service.setSetting('configured', 'token', 'sk-123')

    await expect(service.runCommand('configured.all')).resolves.toEqual({
      greeting: 'Hi',
      token: 'sk-123',
    })
    expect(info('configured')?.settings).toEqual({ greeting: 'Hi', token: { secret: true } })
  })

  it('выключение и удаление', async () => {
    await extension('gone', {}, `export function activate() {}`)
    await service.start()
    await service.setEnabled('gone', false)

    expect(info('gone')?.status).toBe('disabled')

    await service.remove('gone')

    expect(info('gone')).toBeUndefined()
  })
})
