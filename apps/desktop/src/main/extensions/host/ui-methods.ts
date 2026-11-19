import type { ExtensionDialog } from '@shared/extension-ui'

import {
  flag,
  list,
  text,
  count,
  localId,
  handlerOf,
  HostArgError,
  optionalText,
} from './host-args'
import type { HostCall, HostMethod } from './host-types'
import { parseTheme, parseUiTree } from './ui-tree'

/** Пунктов строки состояния у одного расширения: строка общая на всю IDE. */
const STATUS_ITEMS_MAX = 3
const COMMANDS_MAX = 100
const VIEWS_MAX = 8

/** Клавиши команды: хотя бы один из cmd, ctrl, alt и клавиша - иначе расширение крало бы набор. */
const KEYS =
  /^(?:(?:cmd|ctrl|alt|shift)\+)+(?:[a-z0-9]|f(?:[1-9]|1[0-2])|enter|space|tab|escape|up|down|left|right|backspace|delete|[[\];',./`=-])$/

const keysOf = (call: HostCall): string | null => {
  const keys = optionalText(call.args, 'keys', 40)?.toLowerCase().replaceAll(' ', '') ?? null

  if (keys === null) return null
  if (!KEYS.test(keys) || !/(?:^|\+)(?:cmd|ctrl|alt)\+/.test(keys)) {
    throw new HostArgError('"keys" must look like "cmd+shift+k" and use cmd, ctrl or alt.')
  }

  return keys
}

const viewOf = (call: HostCall) => {
  const local = localId(call.args)
  const view = call.runtime.views.get(local)

  if (!view)
    throw new HostArgError(`There is no view "${local}": register it with ide.ui.view first.`)

  return { local, view }
}

const httpUrl = (value: string): string => {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new HostArgError('"url" is not a valid address.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HostArgError('Only http and https addresses open in the browser.')
  }

  return url.toString()
}

const dialogOf = (args: Record<string, unknown>): ExtensionDialog => {
  const title = text(args, 'title', 200)

  switch (args['kind']) {
    case 'prompt':
      return {
        kind: 'prompt',
        title,
        label: optionalText(args, 'label', 200) ?? title,
        value: optionalText(args, 'value', 20_000) ?? '',
        placeholder: optionalText(args, 'placeholder', 200) ?? '',
        multiline: flag(args, 'multiline'),
      }
    case 'confirm':
      return {
        kind: 'confirm',
        title,
        body: optionalText(args, 'body', 4000) ?? '',
        confirmLabel: optionalText(args, 'confirmLabel', 40) ?? 'OK',
        danger: flag(args, 'danger'),
      }
    case 'pick': {
      const items = list(args, 'items')
        .slice(0, 500)
        .map((item) =>
          typeof item === 'string'
            ? { value: item, label: item }
            : {
                value: text(item as Record<string, unknown>, 'value', 200),
                label: text(item as Record<string, unknown>, 'label', 200),
                description:
                  optionalText(item as Record<string, unknown>, 'description', 300) ?? undefined,
              },
        )

      if (items.length === 0) throw new HostArgError('"items" must list at least one choice.')

      return { kind: 'pick', title, items }
    }
    default:
      throw new HostArgError('Unknown dialog.')
  }
}

/** Ручки без прав: команды, виды, строка состояния, уведомления, диалоги, тема. */
export const UI_METHODS: Record<string, HostMethod> = {
  'commands.register': {
    permission: null,
    run: (call) => {
      const local = localId(call.args)

      if (!call.runtime.commands.has(local) && call.runtime.commands.size >= COMMANDS_MAX) {
        throw new HostArgError(`An extension may register up to ${COMMANDS_MAX} commands.`)
      }

      const previous = call.runtime.commands.get(local)

      if (previous) call.context.forget(call.runtime, previous.handler)

      call.runtime.commands.set(local, {
        title: text(call.args, 'title', 120),
        keys: keysOf(call),
        handler: handlerOf(call.args),
      })
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'commands.unregister': {
    permission: null,
    run: (call) => {
      const handler = handlerOf(call.args)

      for (const [local, command] of call.runtime.commands) {
        if (command.handler === handler) call.runtime.commands.delete(local)
      }

      call.context.forget(call.runtime, handler)
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'commands.run': {
    permission: null,
    run: (call) => {
      const id = text(call.args, 'id', 100)

      return call.context.runCommand(
        id.includes('.') ? id : call.runtime.key(id),
        list(call.args, 'args'),
      )
    },
  },
  'ui.notify': {
    permission: null,
    run: (call) => {
      const tone = call.args['tone']
      const link = optionalText(call.args, 'link', 2000)

      call.context.notify(call.runtime, {
        title: text(call.args, 'title', 120),
        body: optionalText(call.args, 'body', 4000) ?? '',
        tone: tone === 'success' || tone === 'attention' || tone === 'danger' ? tone : 'info',
        link: link ? httpUrl(link) : null,
      })
    },
  },
  'ui.view.register': {
    permission: null,
    run: (call) => {
      const local = localId(call.args)
      const known = call.runtime.views.get(local)

      if (!known && call.runtime.views.size >= VIEWS_MAX) {
        throw new HostArgError(`An extension may have up to ${VIEWS_MAX} views.`)
      }

      call.runtime.views.set(local, {
        title: text(call.args, 'title', 60),
        icon: optionalText(call.args, 'icon', 40) ?? call.runtime.manifest.icon,
        place: call.args['place'] === 'side' ? 'side' : 'main',
        badge: known?.badge ?? 0,
        tree: known?.tree ?? null,
        revision: known?.revision ?? 0,
        listener: known?.listener ?? 0,
      })
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'ui.view.render': {
    permission: null,
    run: (call) => {
      const { local, view } = viewOf(call)

      view.tree = parseUiTree(call.args['tree'] ?? null)
      view.revision += 1
      call.context.changed(call.runtime, { kind: 'view', local })
    },
  },
  'ui.view.listen': {
    permission: null,
    run: (call) => {
      viewOf(call).view.listener = handlerOf(call.args)
    },
  },
  'ui.view.badge': {
    permission: null,
    run: (call) => {
      viewOf(call).view.badge = count(call.args, 'count', { min: 0, max: 999, fallback: 0 })
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'ui.view.show': {
    permission: null,
    run: (call) => call.context.showView(call.runtime.key(viewOf(call).local)),
  },
  'ui.view.unregister': {
    permission: null,
    run: (call) => {
      const { local, view } = viewOf(call)

      if (view.listener) call.context.forget(call.runtime, view.listener)

      call.runtime.views.delete(local)
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'ui.status.set': {
    permission: null,
    run: (call) => {
      const local = localId(call.args)
      const command = optionalText(call.args, 'command', 100)

      if (
        !call.runtime.statusItems.has(local) &&
        call.runtime.statusItems.size >= STATUS_ITEMS_MAX
      ) {
        throw new HostArgError(`An extension may show up to ${STATUS_ITEMS_MAX} status bar items.`)
      }

      call.runtime.statusItems.set(local, {
        key: call.runtime.key(local),
        text: text(call.args, 'text', 60),
        icon: optionalText(call.args, 'icon', 40),
        tooltip: optionalText(call.args, 'tooltip', 300),
        command: command ? (command.includes('.') ? command : call.runtime.key(command)) : null,
      })
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'ui.status.remove': {
    permission: null,
    run: (call) => {
      call.runtime.statusItems.delete(localId(call.args))
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'ui.dialog': {
    permission: null,
    run: (call) => call.context.dialog(call.runtime, dialogOf(call.args)),
  },
  'ui.theme': {
    permission: null,
    run: (call) => {
      call.runtime.theme = parseTheme(call.args['tokens'])
      call.context.changed(call.runtime, { kind: 'theme' })
    },
  },
  'ui.openUrl': {
    permission: null,
    run: (call) => call.context.openUrl(httpUrl(text(call.args, 'url', 2000))),
  },
  'hooks.unregister': {
    permission: null,
    run: (call) => {
      const handler = handlerOf(call.args)

      call.runtime.hooks.delete(handler)
      call.context.forget(call.runtime, handler)
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
}
