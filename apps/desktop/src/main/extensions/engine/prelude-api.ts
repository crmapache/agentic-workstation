/**
 * Вторая часть прелюдии: глобальный `ide` - все ручки расширения (ADR 0091). Каждая ручка -
 * вызов IDE по имени метода; проверка прав, рамок и данных - в главном процессе, здесь только
 * удобная форма для автора. Описание для авторов и ИИ - `scaffold/ide-dts.ts`, держать вместе.
 */
export const PRELUDE_API = String.raw`
const view = (spec) => {
  if (!spec || typeof spec.id !== 'string') throw new TypeError('ide.ui.view needs { id, title }')
  const ready = call('ui.view.register', { id: spec.id, title: spec.title, icon: spec.icon, place: spec.place })
  const listeners = []
  let handler = 0
  return {
    render: async (tree) => { await ready; await call('ui.view.render', { id: spec.id, tree: plain(tree) }) },
    onEvent: (fn) => {
      listeners.push(fn)
      if (handler === 0) {
        handler = keep(async (event) => { for (const listener of listeners) await listener(event) }, 'view listener')
        ready.then(() => call('ui.view.listen', { id: spec.id, handler }))
      }
      return { dispose: () => { const at = listeners.indexOf(fn); if (at >= 0) listeners.splice(at, 1) } }
    },
    setBadge: async (count) => { await ready; await call('ui.view.badge', { id: spec.id, count }) },
    show: async () => { await ready; await call('ui.view.show', { id: spec.id }) },
    dispose: async () => { await ready; await call('ui.view.unregister', { id: spec.id }) },
  }
}

const statusItem = (spec) => {
  if (!spec || typeof spec.id !== 'string') throw new TypeError('ide.ui.statusItem needs { id, text }')
  let current = Object.assign({}, spec)
  const ready = call('ui.status.set', current)
  return {
    update: async (patch) => { current = Object.assign(current, patch); await ready; await call('ui.status.set', current) },
    dispose: async () => { await ready; await call('ui.status.remove', { id: spec.id }) },
  }
}

const hook = (name) => async (fn) => {
  const handler = await registered('agent.hook', { hook: name }, fn, 'hook')
  return disposable(handler, 'hooks.unregister')
}

const response = (raw) => Object.assign({}, raw, {
  text: async () => raw.body,
  json: async () => JSON.parse(raw.body),
})

const ide = {
  extension: Object.freeze(Object.assign({}, globalThis.__aw_extension)),
  commands: {
    register: async (id, spec, run) => {
      const options = typeof spec === 'string' ? { title: spec } : Object.assign({}, spec)
      const handler = await registered('commands.register', Object.assign(options, { id }), run, 'command')
      return disposable(handler, 'commands.unregister', { id })
    },
    run: (id, ...args) => call('commands.run', { id, args: plain(args) }),
  },
  ui: {
    notify: (notice) => call('ui.notify', plain(notice)),
    view,
    statusItem,
    prompt: (options) => call('ui.dialog', Object.assign({ kind: 'prompt' }, plain(options))),
    confirm: (options) => call('ui.dialog', Object.assign({ kind: 'confirm' }, plain(options))),
    pick: (options) => call('ui.dialog', Object.assign({ kind: 'pick' }, plain(options))),
    setTheme: (tokens) => call('ui.theme', { tokens: tokens ? plain(tokens) : null }),
    openUrl: (url) => call('ui.openUrl', { url }),
  },
  storage: {
    get: (key) => call('storage.get', { key }),
    set: (key, value) => call('storage.set', { key, value: plain(value) }),
    delete: (key) => call('storage.delete', { key }),
    keys: () => call('storage.keys', {}),
  },
  settings: {
    get: (key) => call('settings.get', { key }),
    all: () => call('settings.all', {}),
    onChange: async (fn) => {
      const handler = await registered('settings.watch', {}, fn, 'settings listener')
      return disposable(handler, 'hooks.unregister')
    },
  },
  projects: {
    list: () => call('projects.list', {}),
    active: () => call('projects.active', {}),
  },
  files: {
    read: (path, options) => call('files.read', Object.assign({ path }, options)),
    list: (path, options) => call('files.list', Object.assign({ path: path || '' }, options)),
    exists: (path, options) => call('files.exists', Object.assign({ path }, options)),
    write: (path, text, options) => call('files.write', Object.assign({ path, text: String(text) }, options)),
    delete: (path, options) => call('files.delete', Object.assign({ path }, options)),
    onDidSave: async (fn) => {
      const handler = await registered('files.watchSaves', {}, fn, 'save listener')
      return disposable(handler, 'hooks.unregister')
    },
  },
  editor: {
    active: () => call('editor.active', {}),
    insert: (text) => call('editor.insert', { text: String(text) }),
    replaceSelection: (text) => call('editor.replaceSelection', { text: String(text) }),
    open: (path, options) => call('editor.open', Object.assign({ path }, options)),
  },
  agent: {
    onBeforeSend: hook('beforeSend'),
    guard: hook('guard'),
    onTurnEnd: hook('turnEnd'),
  },
  tools: {
    register: async (spec, run) => {
      const handler = await registered('tools.register', plain(spec), run, 'tool')
      return disposable(handler, 'tools.unregister', { name: spec.name })
    },
  },
  workstation: {
    tools: () => call('workstation.tools', {}),
    call: (tool, args) => call('workstation.call', { tool, args: plain(args || {}) }),
  },
  net: {
    fetch: async (url, init) => response(await call('net.fetch', Object.assign({ url }, plain(init || {})))),
  },
  shell: {
    run: (command, args, options) => call('shell.run', Object.assign({ command, args: args || [] }, plain(options || {}))),
  },
  clipboard: {
    read: () => call('clipboard.read', {}),
    write: (text) => call('clipboard.write', { text: String(text) }),
  },
}

const freezeDeep = (value) => {
  Object.freeze(value)
  for (const key of Object.keys(value)) {
    const inner = value[key]
    if (inner && typeof inner === 'object' && !Object.isFrozen(inner)) freezeDeep(inner)
  }
  return value
}

delete globalThis.__aw_extension
globalThis.ide = freezeDeep(ide)
`
